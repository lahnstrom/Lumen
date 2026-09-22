#!/usr/bin/env python3
"""Create or verify a portable Lumen data archive; never restore over live data."""
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import sqlite3
import stat
import sys
import tempfile
from datetime import datetime, timezone
from zipfile import ZipFile, ZIP_DEFLATED

RESTORE = '''Lumen workspace backup

This archive contains saved Lumen topics, sources, cards, graph connections,
review history, and any saved Studio database and media.

Before restoring:
1. Verify with: python3 scripts/workspace-backup.py verify YOUR_BACKUP.zip
2. Stop Lumen and Studio. On this host: systemctl --user stop lumen
3. Keep a copy of the destination data/ directory. Extract this archive to a
   separate empty folder, then copy its data/ contents into the stopped app's
   data directory. Do not combine databases or replace data while either app runs.
4. Start Lumen. Check your topics and Studio projects before deleting old copies.

Anki's collection, Codex credentials/thread storage, .env configuration, browser
conversation drafts, and original uploaded PDFs (which Lumen does not retain)
are not included. Set up Codex, Anki and Tailscale separately on a new host.
Pause editing and let generation finish before exporting for the clearest
cross-app snapshot. SQLite is copied with its online backup API, not by copying
an active database file. No credentials are added by the archive exporter.
'''


def safe_member(name):
    p = PurePosixPath(name)
    return '\\' not in name and ':' not in name and not p.is_absolute() and '..' not in p.parts and (name in {'data/workspace.json', 'data/studio/studio.sqlite'} or name.startswith('data/studio/media/'))


def create(data_dir, destination, workspace):
    os.umask(0o077)
    data_dir = Path(data_dir).resolve()
    if not isinstance(workspace, dict) or not isinstance(workspace.get('topics'), list) or not isinstance(workspace.get('reviews'), list):
        raise ValueError('The workspace snapshot is invalid.')
    files = []
    with tempfile.TemporaryDirectory(prefix='lumen-snapshot-', dir=Path(destination).parent) as tmp:
        tmp = Path(tmp)
        snapshot = tmp / 'workspace.json'
        snapshot.write_text(json.dumps(workspace, ensure_ascii=False, indent=2), encoding='utf-8')
        sources = [(snapshot, 'data/workspace.json')]
        studio = data_dir / 'studio'
        database = studio / 'studio.sqlite'
        if studio.is_symlink() or database.is_symlink():
            raise ValueError('Studio backup does not follow symbolic links.')
        if database.exists():
            target = tmp / 'studio.sqlite'
            with closing(sqlite3.connect(database.as_uri() + '?mode=ro', uri=True)) as source_db, closing(sqlite3.connect(target)) as target_db:
                source_db.backup(target_db, pages=256)
                if target_db.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                    raise ValueError('Studio database integrity check failed.')
            sources.append((target, 'data/studio/studio.sqlite'))
        media = studio / 'media'
        if media.is_symlink():
            raise ValueError('Studio media backup does not follow symbolic links.')
        if media.exists():
            for item in sorted(media.rglob('*')):
                if item.is_symlink():
                    raise ValueError('A Studio media file is a symbolic link; use ordinary media files before exporting.')
                if item.is_file(): sources.append((item, 'data/' + item.relative_to(data_dir).as_posix()))
        with ZipFile(destination, 'w', compression=ZIP_DEFLATED, compresslevel=6, strict_timestamps=False) as archive:
            for source, name in sources:
                if not safe_member(name): raise ValueError('A media filename is not portable. Rename it before exporting.')
                digest = hashlib.sha256()
                size = 0
                fd = os.open(source, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
                with os.fdopen(fd, 'rb') as reader, archive.open(name, 'w', force_zip64=True) as writer:
                    before = os.fstat(reader.fileno())
                    if not stat.S_ISREG(before.st_mode): raise ValueError('Only regular files can be backed up.')
                    while chunk := reader.read(1024 * 1024):
                        writer.write(chunk); digest.update(chunk); size += len(chunk)
                    after = os.fstat(reader.fileno())
                    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
                        raise ValueError('A media file changed during backup. Finish editing and try again.')
                files.append({'path': name, 'bytes': size, 'sha256': digest.hexdigest()})
            manifest = {'format': 'lumen-workspace-backup', 'version': 1, 'createdAt': datetime.now(timezone.utc).isoformat(), 'topics': len(workspace['topics']), 'reviews': len(workspace['reviews']), 'files': files}
            archive.writestr('manifest.json', json.dumps(manifest, indent=2))
            archive.writestr('RESTORE.txt', RESTORE)
    return manifest


def verify(filename):
    with ZipFile(filename) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)): raise ValueError('Archive contains duplicate filenames.')
        manifest = json.loads(archive.read('manifest.json'))
        if manifest.get('format') != 'lumen-workspace-backup' or manifest.get('version') != 1: raise ValueError('Unsupported backup format.')
        files = manifest['files']
        expected = {f['path'] for f in files}
        if len(expected) != len(files) or 'data/workspace.json' not in expected or set(names) != expected | {'manifest.json', 'RESTORE.txt'}: raise ValueError('Archive contents do not match its manifest.')
        for item in files:
            name = item['path']
            if not safe_member(name): raise ValueError('Archive contains an unsafe path.')
            digest = hashlib.sha256(); size = 0
            with archive.open(name) as reader:
                while chunk := reader.read(1024 * 1024): digest.update(chunk); size += len(chunk)
            if size != item['bytes'] or digest.hexdigest() != item['sha256']: raise ValueError('Archive checksum mismatch: ' + name)
        workspace = json.loads(archive.read('data/workspace.json'))
        if not isinstance(workspace.get('topics'), list) or not isinstance(workspace.get('reviews'), list): raise ValueError('Workspace data is invalid.')
        return {'verified': True, 'files': len(files), 'topics': len(workspace['topics']), 'reviews': len(workspace['reviews'])}


if __name__ == '__main__':
    try:
        if len(sys.argv) == 4 and sys.argv[1] == 'create': create(sys.argv[2], sys.argv[3], json.load(sys.stdin))
        elif len(sys.argv) == 3 and sys.argv[1] == 'verify': print(json.dumps(verify(sys.argv[2])))
        else: raise ValueError('Usage: workspace-backup.py create DATA_DIRECTORY OUTPUT.zip < workspace.json, or verify BACKUP.zip')
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
