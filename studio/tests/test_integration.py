import io
import json
import zipfile
import pytest
from fastapi.testclient import TestClient
from flashcards import storage, ingest, generate
from flashcards.app import app
from flashcards.export import export_deck

@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, 'DATA', tmp_path / 'data')
    monkeypatch.delenv('LUMEN_STUDIO_TOKEN', raising=False)

def test_internal_token_and_paid_api_block(monkeypatch):
    monkeypatch.setenv('LUMEN_STUDIO_TOKEN', 'test-private-token')
    with TestClient(app) as client:
        assert client.get('/health').status_code == 403
        client.headers['x-lumen-studio-token'] = 'test-private-token'
        assert client.get('/health').status_code == 200
        project = client.post('/api/demo').json()
        monkeypatch.setenv('OPENAI_API_KEY', 'not-a-real-key')
        response = client.post(f'/api/projects/{project["id"]}/generate', json={'mode': 'ai'})
        assert response.status_code == 400
        assert 'disabled' in response.json()['detail']

def test_apkg_media_and_real_anki_rendering(tmp_path):
    import anki.lang
    from anki.collection import Collection
    from anki.importing.apkg import AnkiPackageImporter
    anki.lang.set_lang('en_US')
    project = ingest.generated_demo(); project.clozes = generate.offline(project)
    payload, count = export_deck(project)
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        assert 'collection.anki2' in archive.namelist()
        assert len(json.loads(archive.read('media'))) > 1
    package = tmp_path / 'cards.apkg'; package.write_bytes(payload)
    collection = Collection(str(tmp_path / 'test.anki2'))
    try:
        AnkiPackageImporter(collection, str(package)).run()
        assert collection.card_count() == count == 6
        for cid in collection.find_cards(''):
            card = collection.get_card(cid)
            assert card.question() and card.answer()
        AnkiPackageImporter(collection, str(package)).run()
        assert collection.card_count() == count
    finally:
        collection.close()
