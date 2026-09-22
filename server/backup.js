import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export async function createWorkspaceArchive({ root, dataDir, snapshot, signal }) {
  const directory = await mkdtemp(path.join(tmpdir(), 'lumen-export-'));
  const file = path.join(directory, 'lumen-workspace.zip');
  const cleanup = () => rm(directory, { recursive: true, force: true });
  try {
    await new Promise((resolve, reject) => {
      const child = spawn('python3', [path.join(root, 'scripts/workspace-backup.py'), 'create', dataDir, file], { stdio: ['pipe', 'ignore', 'pipe'], signal, timeout: 120000 });
      let error = '';
      child.stderr.on('data', data => { error = (error + data).slice(-4000); });
      // Wait for process exit before deleting its temporary files, including after abort.
      let failure;
      child.on('error', e => { failure = e; });
      child.on('close', code => code === 0 && !failure ? resolve() : reject(failure || new Error(error.trim() || 'The archive could not be created. Check disk space and try again.')));
      child.stdin.on('error', () => {}); child.stdin.end(snapshot);
    });
    return { file, cleanup };
  } catch (error) { await cleanup(); throw error; }
}
