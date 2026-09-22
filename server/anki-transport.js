import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { release } from 'node:os';

// Fixed loopback destination. Never forward credentials or expose AnkiConnect to the browser.
export async function invokeAnki(action, params = {}) {
  const payload = { action, version: 6, params };
  if (process.env.ANKICONNECT_API_KEY) payload.key = process.env.ANKICONNECT_API_KEY;
  let data;
  try {
    const response = await fetch('http://127.0.0.1:8765', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(35000) });
    if (!response.ok) throw new Error(`AnkiConnect returned HTTP ${response.status}.`);
    data = await response.json();
  } catch (error) {
    // Only retry a refused connection. A timeout may have already committed a review.
    const curl = '/mnt/c/Windows/System32/curl.exe';
    if (error.cause?.code !== 'ECONNREFUSED' || !/microsoft/i.test(release()) || !existsSync(curl)) throw new Error('Cannot reach Anki. Keep desktop Anki open with AnkiConnect installed.');
    data = await new Promise((resolve, reject) => {
      const child = spawn(curl, ['--silent', '--show-error', '--fail', '--noproxy', '*', '--connect-timeout', '3', '--max-time', '35', 'http://127.0.0.1:8765', '-H', 'Content-Type: application/json', '--data-binary', '@-'], { stdio: ['pipe', 'pipe', 'pipe'], timeout: 40000 });
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; }); child.stderr.resume();
      child.on('error', () => reject(new Error('Could not reach Windows Anki.')));
      child.on('close', code => { try { if (code) throw new Error(); resolve(JSON.parse(output.replace(/^\uFEFF/, ''))); } catch { reject(new Error('Anki did not confirm the request. Refresh sync before trying again.')); } });
      child.stdin.on('error', () => {}); child.stdin.end(JSON.stringify(payload));
    });
  }
  if (!data || !Object.hasOwn(data, 'result') || !Object.hasOwn(data, 'error')) throw new Error('Unexpected AnkiConnect response.');
  if (data.error) throw new Error(String(data.error));
  return data.result;
}
