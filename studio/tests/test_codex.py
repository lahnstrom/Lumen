import json
import subprocess
import sys
from pathlib import Path
import pytest
from flashcards import codex_backend as backend, storage, ingest


@pytest.fixture
def project(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, 'DATA', tmp_path / 'data')
    monkeypatch.setattr(backend, 'login_status', lambda: {'ready':True})
    return ingest.demo()


def test_codex_structured_output_and_isolation(project, monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY','secret-never-pass')
    monkeypatch.setenv('CODEX_API_KEY','secret-never-pass')
    monkeypatch.setenv('CODEX_THREAD_ID','parent-session')
    def run(command,prompt,cwd,on_event=None):
        assert '--ignore-user-config' in command and '--ephemeral' in command
        assert 'read-only' in command and 'forced_login_method="chatgpt"' in command
        assert '--image' in command and project.images[0].id in prompt
        assert command[-1]=='-'
        assert 'OPENAI_API_KEY' not in backend.environment()
        assert 'CODEX_API_KEY' not in backend.environment()
        assert 'CODEX_THREAD_ID' not in backend.environment()
        path=Path(command[command.index('--output-last-message')+1])
        path.write_text(json.dumps({'clozes':[{'text':'{{c1::Water}} evaporates.','extra':'','evidence':'Source'}],'occlusions':[]}))
    monkeypatch.setattr(backend,'run_process',run)
    cards,regions=backend.generate_codex(project)
    assert len(cards)==1 and not regions


def test_invalid_codex_output_preserves_drafts_and_releases_lock(project, monkeypatch):
    def run(command,prompt,cwd,on_event=None):
        Path(command[command.index('--output-last-message')+1]).write_text('not json')
    monkeypatch.setattr(backend,'run_process',run)
    original=project.model_dump()
    with pytest.raises(ValueError,match='invalid card data'):backend.generate_codex(project)
    assert original==project.model_dump()
    assert not backend.RUN_LOCK.locked()


def test_api_login_is_rejected(monkeypatch):
    monkeypatch.setattr(backend.shutil,'which',lambda _: '/bin/codex')
    monkeypatch.setattr(backend.subprocess,'run',lambda *a,**k:subprocess.CompletedProcess([],0,'','Logged in using an API key'))
    assert backend.login_status()['ready'] is False


def test_only_one_codex_job(project):
    with backend.RUN_LOCK:
        with pytest.raises(ValueError,match='Another Codex job'):backend.generate_codex(project)


def test_missing_login_rejected(project,monkeypatch):
    monkeypatch.setattr(backend,'login_status',lambda:{'ready':False,'message':'Please log in'})
    with pytest.raises(ValueError,match='Please log in'):backend.generate_codex(project)


def test_timeout_stops_worker(tmp_path,monkeypatch):
    monkeypatch.setattr(backend,'TIMEOUT',.05)
    with pytest.raises(ValueError,match='was stopped'):
        backend.run_process([sys.executable,'-c','import time; time.sleep(5)'],'',tmp_path)


def test_http_codex_mode_saves_validated_cards(project,monkeypatch):
    from fastapi.testclient import TestClient
    from flashcards.app import app
    from flashcards.models import Cloze
    project.text='A triangle has three sides.'
    storage.save(project)
    monkeypatch.setattr(backend,'generate_codex',lambda p:([Cloze(text='A triangle has {{c1::three}} sides.',evidence='A triangle has three sides.')],{}))
    with TestClient(app) as client:
        response=client.post(f'/api/projects/{project.id}/generate',json={'mode':'codex'})
        assert response.status_code==200
        assert response.json()['clozes'][0]['text']=='A triangle has {{c1::three}} sides.'
        assert storage.get(project.id).clozes
