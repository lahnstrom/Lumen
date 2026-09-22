import pytest
import httpx
from fastapi.testclient import TestClient
from flashcards import storage, generate, codex_backend, anki_connect, ingest
from flashcards.app import app
from flashcards.models import Project, Cloze


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, 'DATA', tmp_path / 'data')


def test_section_count_and_mask_setting(monkeypatch):
    p = ingest.demo()
    p.text = 'A triangle has three sides. A square has four sides.'
    p.generate_masks = False
    storage.save(p)
    calls = []
    def fake(material):
        calls.append(material)
        return [Cloze(text='A triangle has {{c1::three}} sides.')], {}
    monkeypatch.setattr(codex_backend, 'generate_codex', fake)
    with TestClient(app) as c:
        url = f'/api/projects/{p.id}/generate'
        r = c.post(url, json={'mode': 'codex', 'section': 'A triangle has three sides.', 'card_count': 3})
        assert r.status_code == 200
        assert calls[0].target_cards == 3
        assert calls[0].text == 'A triangle has three sides.'
        assert calls[0].images == [] and not calls[0].generate_masks
        assert r.json()['text'] == p.text
        assert r.json()['images'][0]['regions'] == p.model_dump()['images'][0]['regions']
        assert c.post(url, json={'mode': 'codex', 'section': 'Not in source'}).status_code == 400
        assert c.post(url, json={'mode': 'codex', 'card_count': 51}).status_code == 422
        assert len(calls) == 1
        c.post(url, json={'mode': 'codex'})
        assert not calls[1].generate_masks and calls[1].images


def test_limits_and_prompt():
    p = Project(target_cards=50, generate_masks=False, text='\n'.join(f'Term{i} is a sufficiently long definition.' for i in range(70)))
    assert len(generate.offline(p)) == 50
    assert 'at most 50' in generate.prompt_for(p)
    assert 'MASK GENERATION IS DISABLED' in generate.prompt_for(p)
    _, masks = generate.parse_suggestions({'clozes': [], 'occlusions': [{'bad': True}]}, [], generate_masks=False)
    assert masks == {}
    p.clozes = [Cloze(text=f'Example {i} contains {{{{c1::answer}}}}.') for i in range(500)]
    storage.save(p)
    with TestClient(app) as c:
        assert c.post(f'/api/projects/{p.id}/generate', json={'mode': 'offline'}).status_code == 400


def fake_anki(monkeypatch, failure=False, mismatch=False):
    notes, models, media, calls = [], {}, {}, []
    def invoke(action, **params):
        calls.append((action, params))
        if action == 'version': return 6
        if action == 'deckNames': return ['Existing deck']
        if action == 'modelNames': return ['Flashcard Studio Cloze'] if mismatch else list(models)
        if action == 'modelFieldNames': return ['Wrong'] if mismatch else models[params['modelName']]['inOrderFields']
        if action == 'createModel': models[params['modelName']] = params; return {}
        if action == 'findNotes': return [i+1 for i, n in enumerate(notes) if params['query'][4:] in n['tags']]
        if action == 'storeMediaFile':
            assert params['deleteExisting'] is False
            media[params['filename']] = params['data']; return params['filename']
        if action == 'addNote':
            if failure and notes: raise ValueError('Simulated failure')
            notes.append(params['note']); return len(notes)
        raise AssertionError(action)
    monkeypatch.setattr(anki_connect, 'invoke', invoke)
    return notes, models, media, calls


def test_direct_send_idempotent_and_media(monkeypatch):
    notes, models, media, calls = fake_anki(monkeypatch)
    p = ingest.demo(); p.clozes = generate.offline(p)
    first = anki_connect.send(p, 'Existing deck')
    assert first == {'added': 6, 'skipped': 0, 'errors': []}
    assert anki_connect.send(p, 'Existing deck') == {'added': 0, 'skipped': 6, 'errors': []}
    assert len(notes) == 6 and media
    assert models['Flashcard Studio Cloze']['isCloze']
    assert not models['Image Occlusion Enhanced']['isCloze']
    assert all(n['deckName'] == 'Existing deck' for n in notes)
    assert all('src="fs_' in n['fields']['Image'] for n in notes if 'Image' in n['fields'])
    assert not any(action in ('updateNoteFields', 'updateModelTemplates', 'deleteNotes') for action, _ in calls)


def test_send_partial_failure_and_incompatible_model(monkeypatch):
    p = Project(clozes=[Cloze(text='One {{c1::answer}}.'), Cloze(text='Two {{c1::answers}}.')])
    fake_anki(monkeypatch, failure=True)
    r = anki_connect.send(p, 'Existing deck')
    assert r['added'] == 1 and len(r['errors']) == 1
    notes, models, media, calls = fake_anki(monkeypatch, mismatch=True)
    with pytest.raises(ValueError, match='incompatible'):
        anki_connect.send(p, 'Existing deck')
    assert not notes and not models and not media
    with pytest.raises(ValueError, match='existing Anki deck'):
        anki_connect.send(p, 'Missing')


def test_windows_fallback_only_on_connection_failure(monkeypatch):
    calls = []
    def failed(*args, **kwargs):
        raise httpx.ConnectError('Connection refused')
    def windows(payload):
        calls.append(payload)
        return {'result': ['Existing deck'], 'error': None}
    monkeypatch.setattr(anki_connect.httpx, 'post', failed)
    monkeypatch.setattr(anki_connect, 'windows_request', windows)
    assert anki_connect.invoke('deckNames') == ['Existing deck']
    assert calls[0]['action'] == 'deckNames'
    def timeout(*args, **kwargs):
        raise httpx.ReadTimeout('May already have added the note')
    monkeypatch.setattr(anki_connect.httpx, 'post', timeout)
    with pytest.raises(ValueError, match='Cannot reach'):
        anki_connect.invoke('addNote', note={})
    assert len(calls) == 1  # Never replay a potentially completed write.


def test_windows_bridge_uses_stdin(monkeypatch):
    import json
    from types import SimpleNamespace
    monkeypatch.setattr(anki_connect.platform, 'release', lambda: 'microsoft-standard-WSL2')
    monkeypatch.setattr(type(anki_connect.WINDOWS_CURL), 'is_file', lambda self: True)
    payload = {'action': 'deckNames', 'version': 6, 'key': 'test-secret', 'params': {}}
    def run(args, **kwargs):
        assert 'test-secret' not in str(args)
        assert json.loads(kwargs['input']) == payload
        assert not kwargs.get('shell')
        assert '@-' in args and '--noproxy' in args
        return SimpleNamespace(stdout=b'{"result": ["Deck"], "error": null}')
    monkeypatch.setattr(anki_connect.subprocess, 'run', run)
    assert anki_connect.windows_request(payload)['result'] == ['Deck']


@pytest.mark.parametrize('added,skipped,errors,expected', [(1,0,[],'requested'),(0,1,[],'requested'),(1,0,['one failed'],'requested'),(0,0,['all failed'],'not_requested')])
def test_sync_after_send(monkeypatch, added, skipped, errors, expected):
    calls=[]
    monkeypatch.setattr(anki_connect,'send',lambda p,d: {'added':added,'skipped':skipped,'errors':errors})
    monkeypatch.setattr(anki_connect,'invoke',lambda action: calls.append(action))
    result=anki_connect.send_and_sync(Project(),'Deck')
    assert result['sync']['state']==expected
    assert calls==(['sync'] if expected=='requested' else [])
    assert result['errors']==errors


def test_sync_failure_preserves_insertion_result(monkeypatch):
    monkeypatch.setattr(anki_connect,'send',lambda p,d: {'added':2,'skipped':1,'errors':[]})
    def fail(action):
        raise ValueError('sync: auth not configured')
    monkeypatch.setattr(anki_connect,'invoke',fail)
    p=Project();storage.save(p)
    with TestClient(app) as client:
        response=client.post(f'/api/projects/{p.id}/anki',json={'deck':'Deck'})
    assert response.status_code==200
    result=response.json()
    assert result['added']==2 and result['skipped']==1
    assert result['sync']=={'state':'failed','error':'sync: auth not configured'}
