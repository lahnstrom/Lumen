"""Copy authoring projects/media only. Never mutate the original Studio database."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path, help='Original Flashcard Studio data directory')
parser.add_argument('--destination', type=Path, default=Path(__file__).resolve().parents[1] / 'data' / 'studio')
args = parser.parse_args()
source, destination = args.source.resolve(), args.destination.resolve()
if source == destination:
    raise SystemExit('Source and destination must differ.')
source_db = source / 'studio.sqlite'
with sqlite3.connect(source_db.as_uri() + '?mode=ro', uri=True) as db:
    rows = db.execute('SELECT id, body FROM projects').fetchall()
projects = [(project_id, body, json.loads(body)) for project_id, body in rows]
for _, _, project in projects:
    for image in project.get('images', []):
        name = image['filename']
        if not re.fullmatch(r'[a-f0-9]{32}\.png', name) or not (source / 'media' / name).is_file():
            raise SystemExit('A referenced source image is missing or invalid. No projects were imported.')
(destination / 'media').mkdir(parents=True, exist_ok=True)
with sqlite3.connect(destination / 'studio.sqlite') as db:
    db.execute('CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, body TEXT NOT NULL)')
    added = 0
    for project_id, body, project in projects:
        if db.execute('SELECT 1 FROM projects WHERE id=?', (project_id,)).fetchone():
            continue
        for image in project.get('images', []):
            src = source / 'media' / image['filename']; dst = destination / 'media' / image['filename']
            if dst.exists() and dst.read_bytes() != src.read_bytes():
                raise SystemExit('An image name conflicts with an existing file. No database changes committed.')
            if not dst.exists():
                shutil.copy2(src, dst)
        db.execute('INSERT INTO projects VALUES (?,?)', (project_id, body)); added += 1
os.chmod(destination / 'studio.sqlite', 0o600)
print(f'Imported {added} workspaces; skipped {len(projects)-added} already present. Original data is unchanged.')
