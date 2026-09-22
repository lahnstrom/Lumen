"""Test-only AnkiConnect-compatible adapter over a disposable real Anki collection.

No network, no AnkiWeb, and no user's desktop profile. Methods follow the installed
AnkiConnect implementation so JS integration tests exercise Anki's actual scheduler.
"""
import json
import sys
from pathlib import Path
import anki.lang
from anki.collection import Collection
anki.lang.set_lang('en_US')
collection = Collection(str(Path(sys.argv[1]) / 'test.anki2'))


def invoke(action, p):
    if action == 'testStudioBundle':
        sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'studio'))
        from flashcards import ingest, generate, storage
        from flashcards.lumen_anki import bundle
        storage.DATA = Path(sys.argv[1]) / 'studio'
        project = ingest.generated_demo(); project.clozes = generate.offline(project)
        return bundle(project)
    if action == 'getActiveProfile': return 'Disposable test profile'
    if action == 'apiReflect': return {'actions': p['actions']}
    if action == 'deckNames': return [d.name for d in collection.decks.all_names_and_ids()]
    if action == 'createDeck': return collection.decks.id(p['deck'])
    if action == 'modelNames': return [m.name for m in collection.models.all_names_and_ids()]
    if action == 'modelFieldNames': return [f['name'] for f in collection.models.by_name(p['modelName'])['flds']]
    if action == 'createModel':
        m = collection.models.new(p['modelName'])
        for name in p['inOrderFields']: collection.models.add_field(m, collection.models.new_field(name))
        for source in p['cardTemplates']:
            t = collection.models.new_template(source['Name']); t['qfmt'] = source['Front']; t['afmt'] = source['Back']; collection.models.add_template(m, t)
        m['css'] = p.get('css', '')
        if p.get('isCloze'): m['type'] = 1
        collection.models.add(m)
        return m
    if action == 'findNotes': return list(collection.find_notes(p['query']))
    if action == 'findCards': return list(collection.find_cards(p['query']))
    if action == 'addNote':
        data = p['note']; note = collection.new_note(collection.models.by_name(data['modelName']))
        for k, v in data['fields'].items(): note[k] = v
        note.tags = data['tags']; collection.add_note(note, collection.decks.id(data['deckName'])); return note.id
    if action == 'notesInfo': return [{'noteId': nid, 'cards': [c.id for c in collection.get_note(nid).cards()]} for nid in p['notes']]
    if action == 'cardsInfo':
        result = []
        for cid in p['cards']:
            c = collection.get_card(cid); n = c.note()
            states = collection._backend.get_scheduling_states(c.id)
            result.append({'cardId': c.id, 'note': c.nid, 'ord': c.ord, 'fields': {k: {'value': v, 'order': i} for i, (k, v) in enumerate(n.items())}, 'mod': c.mod, 'reps': c.reps, 'lapses': c.lapses, 'due': c.due, 'queue': c.queue, 'type': c.type, 'interval': c.ivl, 'deckName': collection.decks.name(c.did), 'question': c.question(), 'answer': c.answer(), 'css': c.note_type()['css'], 'nextReviews': list(collection._backend.describe_next_states(states))})
        return result
    if action == 'getReviewsOfCards':
        keys = ['id', 'usn', 'ease', 'ivl', 'lastIvl', 'factor', 'time', 'type']
        return {cid: [dict(zip(keys, r)) for r in collection.db.all('select id,usn,ease,ivl,lastIvl,factor,time,type from revlog where cid=?', cid)] for cid in p['cards']}
    if action == 'answerCards':
        for answer in p['answers']:
            c = collection.get_card(answer['cardId']); c.start_timer(); collection.sched.answerCard(c, answer['ease'])
        return [True for _ in p['answers']]
    if action == 'updateNoteFields':
        n = collection.get_note(p['note']['id'])
        for k, v in p['note']['fields'].items(): n[k] = v
        collection.update_note(n)
        return None
    if action == 'storeMediaFile':
        import base64
        return collection.media.write_data(p['filename'], base64.b64decode(p['data']))
    if action == 'sync': return None  # Never contact a cloud service from tests.
    raise ValueError('Unsupported test action: ' + action)


try:
    for line in sys.stdin:
        try:
            data = json.loads(line); response = {'result': invoke(data['action'], data.get('params', {})), 'error': None}
        except Exception as error: response = {'result': None, 'error': str(error)}
        print(json.dumps(response), flush=True)
finally:
    collection.close()
