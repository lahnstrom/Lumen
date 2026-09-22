import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { request } from 'node:http';
import path from 'node:path';

export class Studio {
  constructor(root, dataDir) { this.root = path.join(root, 'studio'); this.dataDir = path.join(dataDir, 'studio'); this.token = randomBytes(32).toString('hex'); this.child = null; this.ready = null; this.port = null; }
  async start() {
    if (this.ready) return this.ready;
    this.ready = this.boot().catch(error => { this.close(); throw error; });
    return this.ready;
  }
  async boot() {
    const python = path.join(this.root, '.venv', 'bin', 'python');
    if (!existsSync(python)) throw new Error('Studio dependencies are missing. Run npm run setup:studio on the host.');
    this.port = await new Promise((resolve, reject) => { const socket = createServer(); socket.once('error', reject); socket.listen(0, '127.0.0.1', () => { const port = socket.address().port; socket.close(() => resolve(port)); }); });
    const env = { ...process.env, FLASHCARD_DATA: this.dataDir, LUMEN_STUDIO_TOKEN: this.token, FLASHCARD_JOBS_AUTOSTART: '0' };
    for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_BASE_URL', 'FLASHCARD_PUBLIC_ORIGIN']) delete env[key];
    const child = spawn(python, ['-m', 'uvicorn', 'flashcards.app:app', '--host', '127.0.0.1', '--port', String(this.port), '--no-access-log'], { cwd: this.root, env, stdio: ['ignore', 'ignore', 'pipe'] });
    this.child = child;
    let failure;
    child.stderr.on('data', () => {});
    child.on('error', () => { failure = new Error('Studio could not start. Check the Python installation.'); });
    child.on('exit', () => { if (this.child === child) { this.child = null; this.ready = null; } failure = new Error('Studio stopped. Reload the Studio workspace to reconnect.'); });
    for (let n = 0; n < 100; n++) {
      if (failure) throw failure;
      try { const response = await fetch(`http://127.0.0.1:${this.port}/health`, { headers: { 'x-lumen-studio-token': this.token }, signal: AbortSignal.timeout(500) }); if (response.ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Studio is taking too long to start. Reload to try again.');
  }
  async api(route, method = 'GET', body) {
    await this.start();
    const response = await fetch(`http://127.0.0.1:${this.port}${route}`, { method, headers: { 'Content-Type': 'application/json', 'x-lumen-studio-token': this.token }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(350000) });
    const result = await response.json();
    if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'Studio could not complete this request.');
    return result;
  }
  async proxy(req, res) {
    try { await this.start(); } catch (e) { return res.status(503).send(e.message); }
    const headers = { host: `127.0.0.1:${this.port}`, 'x-lumen-studio-token': this.token };
    for (const key of ['content-type', 'content-length', 'accept', 'range']) if (req.headers[key]) headers[key] = req.headers[key];
    const upstream = request({ hostname: '127.0.0.1', port: this.port, path: req.url, method: req.method, headers, timeout: 360000 }, reply => {
      res.writeHead(reply.statusCode, reply.headers); reply.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.status(502).json({ error: 'Studio disconnected. Reload to reconnect.' }); else res.destroy(); });
    upstream.on('timeout', () => upstream.destroy());
    req.on('aborted', () => upstream.destroy());
    req.pipe(upstream);
  }
  close() { this.child?.kill(); this.child = null; this.ready = null; }
}
