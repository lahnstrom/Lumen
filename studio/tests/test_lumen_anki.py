import pytest
from flashcards import generate, ingest, storage
from flashcards.lumen_anki import bundle
from flashcards.export import deck_content

@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, 'DATA', tmp_path / 'data')

def test_bundle_matches_export_identities_and_preserves_media():
    project = ingest.generated_demo()
    project.clozes = generate.offline(project)
    payload = bundle(project)
    with deck_content(project) as (deck, media, count):
        assert len(payload['notes']) == len(deck.notes)
        assert sum(len(n['cards']) for n in payload['notes']) == count == 6
        assert {n['tag'] for n in payload['notes']} == {next(t for t in n.tags if t.startswith('flashcard_studio_id_')) for n in deck.notes}
        assert all(m['data'] and m['filename'].startswith('fs_') for m in payload['media'])
    assert len({c['key'] for n in payload['notes'] for c in n['cards']}) == count
    assert all(c['ord'] >= 0 for n in payload['notes'] for c in n['cards'])

def test_sparse_cloze_indices_map_to_anki_template_ordinals():
    project = ingest.generated_demo()
    project.clozes = generate.offline(project)
    project.clozes[0].text = '{{c1::One}} and {{c7::Seven}}'
    project.clozes = project.clozes[:1]
    project.images = []
    payload = bundle(project)
    assert [c['ord'] for c in payload['notes'][0]['cards']] == [0, 6]
