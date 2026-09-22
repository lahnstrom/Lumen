"""Build Anki notes and stable card identities without writing to Anki."""
import base64
import hashlib
from pathlib import Path
from .export import deck_content
from .models import CLOZE


def bundle(project):
    identities = []
    for note in project.clozes:
        if note.enabled:
            identities.append([{'key': f'cloze:{note.id}:{index}', 'ord': index - 1}
                               for index in sorted({int(m[1]) for m in CLOZE.finditer(note.text)})])
    for image in project.images:
        if image.enabled:
            for region in image.regions:
                identities.append([{'key': f'occlusion:{image.id}:{region.id}', 'ord': 0}])
    with deck_content(project) as (deck, files, _):
        media = []
        replacements = {}
        for filename in files:
            path = Path(filename)
            data = path.read_bytes()
            name = 'fs_' + hashlib.sha256(data).hexdigest() + path.suffix
            replacements[path.name] = name
            media.append({'filename': name, 'data': base64.b64encode(data).decode()})
        notes = []
        for note, cards in zip(deck.notes, identities, strict=True):
            fields = {}
            for field, value in zip(note.model.fields, note.fields):
                for old, new in replacements.items():
                    value = value.replace(f'src="{old}"', f'src="{new}"')
                fields[field['name']] = value
            notes.append({'tag': next(t for t in note.tags if t.startswith('flashcard_studio_id_')),
                          'model': {'modelName': note.model.name, 'inOrderFields': [f['name'] for f in note.model.fields],
                                    'css': note.model.css, 'isCloze': note.model.model_type == 1,
                                    'cardTemplates': [{'Name': t['name'], 'Front': t['qfmt'], 'Back': t['afmt']} for t in note.model.templates]},
                          'fields': fields, 'tags': note.tags, 'cards': cards})
        return {'notes': notes, 'media': media}
