import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createWorkspaceArchive } from '../server/backup.js';
const exec = promisify(execFile), root = process.cwd();
const script = path.join(root, 'scripts/workspace-backup.py');
const snapshot = JSON.stringify({ topics: [{ id: 'heart', cards: [] }], reviews: [] });
async function fixture(t) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'lumen-backup-test-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  return dataDir;
}
test('complete archive preserves Studio data and media while excluding unrelated files', async t => {
  const dataDir = await fixture(t);
  await mkdir(path.join(dataDir, 'studio/media'), { recursive: true });
  await writeFile(path.join(dataDir, 'studio/media/heart.png'), 'fixture-image');
  await writeFile(path.join(dataDir, '.env'), 'DO_NOT_EXPORT');
  await writeFile(path.join(dataDir, 'workspace-old.json'), 'DO_NOT_EXPORT');
  await exec('python3', ['-c', "import sqlite3,sys; db=sqlite3.connect(sys.argv[1]); db.execute('CREATE TABLE projects(id TEXT, body TEXT)'); db.execute(\"INSERT INTO projects VALUES ('saved', 'project')\"); db.commit(); db.close()", path.join(dataDir, 'studio/studio.sqlite')]);
  const archive = await createWorkspaceArchive({ root, dataDir, snapshot });
  t.after(archive.cleanup);
  const { stdout } = await exec('python3', [script, 'verify', archive.file]);
  assert.deepEqual(JSON.parse(stdout), { verified: true, files: 3, topics: 1, reviews: 0 });
  const inspect = await exec('python3', ['-c', "import zipfile,sys,sqlite3,tempfile,pathlib; z=zipfile.ZipFile(sys.argv[1]); assert z.read('data/studio/media/heart.png') == b'fixture-image'; assert not any('.env' in n or 'workspace-old' in n for n in z.namelist()); d=tempfile.TemporaryDirectory(); p=pathlib.Path(d.name)/'copy.sqlite'; p.write_bytes(z.read('data/studio/studio.sqlite')); db=sqlite3.connect(p); assert db.execute('SELECT id FROM projects').fetchone()[0]=='saved'; db.close(); d.cleanup()", archive.file]);
  assert.equal(inspect.stderr, '');
  await archive.cleanup(); await assert.rejects(access(archive.file));
});
test('workspace-only archives verify, and altered data fails checksum verification', async t => {
  const dataDir = await fixture(t);
  const archive = await createWorkspaceArchive({ root, dataDir, snapshot }); t.after(archive.cleanup);
  assert.equal(JSON.parse((await exec('python3', [script, 'verify', archive.file])).stdout).files, 1);
  const altered = path.join(dataDir, 'altered.zip');
  await exec('python3', ['-c', "import zipfile,sys; a=zipfile.ZipFile(sys.argv[1]); b=zipfile.ZipFile(sys.argv[2],'w'); [(b.writestr(n, b'changed' if n=='data/workspace.json' else a.read(n))) for n in a.namelist()]; b.close()", archive.file, altered]);
  await assert.rejects(exec('python3', [script, 'verify', altered]), /checksum mismatch/);
});
test('export rejects media symlinks and invalid snapshots', async t => {
  const dataDir = await fixture(t); await mkdir(path.join(dataDir, 'studio/media'), { recursive: true });
  await writeFile(path.join(dataDir, 'private.txt'), 'private');
  await symlink(path.join(dataDir, 'private.txt'), path.join(dataDir, 'studio/media/leak'));
  await assert.rejects(createWorkspaceArchive({ root, dataDir, snapshot }), /symbolic link/);
  await assert.rejects(createWorkspaceArchive({ root, dataDir, snapshot: '{}' }), /snapshot is invalid/);
});
test('an aborted export rejects instead of returning an incomplete archive', async t => {
  const dataDir = await fixture(t), controller = new AbortController(); controller.abort();
  await assert.rejects(createWorkspaceArchive({ root, dataDir, snapshot, signal: controller.signal }), { name: 'AbortError' });
});
test('SQLite backup includes committed changes still in the live WAL', async t => {
  const dataDir = await fixture(t);
  await exec('python3', ['-c', `import importlib.util, pathlib, sqlite3, sys, zipfile
spec=importlib.util.spec_from_file_location('backup', sys.argv[1]); module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
root=pathlib.Path(sys.argv[2]); studio=root/'studio'; studio.mkdir()
db=sqlite3.connect(studio/'studio.sqlite'); db.execute('PRAGMA journal_mode=WAL'); db.execute('PRAGMA wal_autocheckpoint=0')
db.execute('CREATE TABLE projects(id TEXT)'); db.execute("INSERT INTO projects VALUES ('in-live-wal')"); db.commit()
assert (studio/'studio.sqlite-wal').stat().st_size > 0
archive=root/'backup.zip'; module.create(root, archive, {'topics': [], 'reviews': []}); module.verify(archive)
with zipfile.ZipFile(archive) as z: (root/'restored.sqlite').write_bytes(z.read('data/studio/studio.sqlite'))
restored=sqlite3.connect(root/'restored.sqlite'); assert restored.execute('SELECT id FROM projects').fetchone()[0]=='in-live-wal'; restored.close(); db.close()
`, script, dataDir]);
});
