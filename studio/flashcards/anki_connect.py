"""Explicit, local-only AnkiConnect integration; never modifies existing notes."""
import base64
import hashlib
import os
import json
import platform
import subprocess
import threading
from pathlib import Path

import httpx

from .export import deck_content


WINDOWS_CURL = Path('/mnt/c/Windows/System32/curl.exe')
SEND_LOCK = threading.RLock()


def send_and_sync(project, deck_name):
    # Serialize insertion and sync across workspaces, not only within one project.
    with SEND_LOCK:
        result = send(project, deck_name)
        result['sync'] = {'state': 'not_requested', 'error': ''}
        if result['added'] or result['skipped']:
            try:
                invoke('sync')
                # AnkiConnect can return before Anki finishes its background work.
                result['sync']['state'] = 'requested'
            except ValueError as exc:
                result['sync'] = {'state': 'failed', 'error': str(exc)}
        return result


def windows_request(payload):
    """Reach Windows loopback from WSL without exposing Anki to the LAN.

    Payload travels on stdin, never in command arguments or shell source.
    Only used after a refused Linux connection, not after ambiguous timeouts.
    """
    if 'microsoft' not in platform.release().lower() or not WINDOWS_CURL.is_file():
        raise ValueError('Windows loopback bridge is unavailable.')
    try:
        result = subprocess.run(
            [str(WINDOWS_CURL), '--silent', '--show-error', '--fail', '--noproxy', '*',
             '--connect-timeout', '3', '--max-time', '30',
             'http://127.0.0.1:8765', '-H', 'Content-Type: application/json',
             '--data-binary', '@-'],
            input=json.dumps(payload, ensure_ascii=True).encode('utf-8'),
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=35, check=True,
        )
        return json.loads(result.stdout.decode('utf-8-sig'))
    except (OSError, subprocess.SubprocessError, UnicodeError) as exc:
        raise ValueError('Windows AnkiConnect connection failed.') from exc


def invoke(action, **params):
    payload = {'action': action, 'version': 6, 'params': params}
    if os.environ.get('ANKICONNECT_API_KEY'):
        payload['key'] = os.environ['ANKICONNECT_API_KEY']
    try:
        try:
            response = httpx.post('http://127.0.0.1:8765', json=payload, timeout=30, trust_env=False)
            response.raise_for_status()
            data = response.json()
        except httpx.ConnectError:
            data = windows_request(payload)
    except (httpx.HTTPError, ValueError) as exc:
        raise ValueError('Cannot reach AnkiConnect. Open Anki with add-on 2055492159 installed, and keep it open. If a send was interrupted, retry to check for already-added notes.') from exc
    if not isinstance(data, dict) or 'error' not in data or 'result' not in data:
        raise ValueError('Unexpected response from AnkiConnect on port 8765.')
    if data['error']:
        raise ValueError('AnkiConnect: ' + str(data['error']))
    return data['result']


def decks():
    if invoke('version') < 6:
        raise ValueError('Please update AnkiConnect to support API version 6.')
    return invoke('deckNames')


def send(project, deck_name):
    if deck_name not in decks():
        raise ValueError('Choose an existing Anki deck, then try again.')
    result = {'added': 0, 'skipped': 0, 'errors': []}
    with deck_content(project) as (deck, media, _):
        pending = []
        for note in deck.notes:
            tag = next(tag for tag in note.tags if tag.startswith('flashcard_studio_id_'))
            if invoke('findNotes', query='tag:' + tag):
                result['skipped'] += 1
            else:
                pending.append(note)
        if not pending:
            return result
        known = invoke('modelNames')
        models = {note.model.name: note.model for note in pending}
        # Validate all existing models before writing anything.
        for name, model in models.items():
            fields = [f['name'] for f in model.fields]
            if name in known and invoke('modelFieldNames', modelName=name) != fields:
                raise ValueError(f'Anki note type "{name}" has incompatible fields. No existing note type was changed.')
        for name, model in models.items():
            if name not in known:
                invoke('createModel', modelName=name, inOrderFields=[f['name'] for f in model.fields],
                       css=model.css, isCloze=model.model_type == 1,
                       cardTemplates=[{'Name': t['name'], 'Front': t['qfmt'], 'Back': t['afmt']} for t in model.templates])
        replacements = {}
        for filename in media:
            path = Path(filename)
            data = path.read_bytes()
            name = 'fs_' + hashlib.sha256(data).hexdigest() + path.suffix
            stored = invoke('storeMediaFile', filename=name, data=base64.b64encode(data).decode(), deleteExisting=False)
            replacements[path.name] = stored
        for note in pending:
            fields = {}
            for field, value in zip(note.model.fields, note.fields):
                for old, new in replacements.items():
                    value = value.replace(f'src="{old}"', f'src="{new}"')
                fields[field['name']] = value
            try:
                note_id = invoke('addNote', note={'deckName': deck_name, 'modelName': note.model.name,
                                'fields': fields, 'tags': note.tags, 'options': {'allowDuplicate': False}})
                if note_id is None:
                    raise ValueError('Anki did not add this note (possibly a duplicate).')
                result['added'] += 1
            except ValueError as exc:
                result['errors'].append(str(exc))
    return result
