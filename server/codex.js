import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';

export class Codex extends EventEmitter {
  pending = new Map(); sequence = 0; child = null; ready = null;
  async connect() {
    if (this.ready) return this.ready;
    this.ready = this.boot().catch(error => { this.ready = null; throw error; });
    return this.ready;
  }
  async boot() {
    const env = { ...process.env };
    for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_BASE_URL']) delete env[key];
    const child = spawn(process.env.CODEX_BIN || 'codex', ['app-server', '--listen', 'stdio://', '-c', 'forced_login_method="chatgpt"', '-c', 'model_provider="openai"', '-c', 'web_search="live"'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    createInterface({ input: child.stdout }).on('line', line => {
      let msg; try { msg = JSON.parse(line); } catch { return; }
      if (msg.id != null && !msg.method) {
        const request = this.pending.get(msg.id);
        if (request) { clearTimeout(request.timer); this.pending.delete(msg.id); msg.error ? request.reject(new Error(msg.error.message)) : request.resolve(msg.result); }
      } else if (msg.method) {
        if (msg.id != null) {
          // The tutor never receives automatic approval to run local commands or change files.
          const result = /requestApproval/.test(msg.method) ? { decision: 'decline' } : null;
          child.stdin.write(JSON.stringify(result ? { id: msg.id, result } : { id: msg.id, error: { code: -32601, message: 'Interactive tool unavailable in Lumen. Ask in the conversation instead.' } }) + '\n');
        }
        this.emit('notification', msg);
      }
    });
    child.stderr.on('data', () => {});
    const failed = error => {
      if (this.child !== child) return;
      this.child = null; this.ready = null;
      for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); }
      this.pending.clear(); this.emit('disconnected', error);
    };
    child.on('error', failed); child.on('exit', () => failed(new Error('Codex disconnected. Reconnect and try again.')));
    await this.request('initialize', { clientInfo: { name: 'lumen_study', title: 'Lumen Study', version: '0.1.0' } });
    child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
  }
  request(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.child?.stdin.writable) return reject(new Error('Codex is not running. Install Codex CLI and reconnect.'));
      const id = ++this.sequence;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex timed out (${method}).`)); }, 45000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }
  async account() { await this.connect(); return this.request('account/read', {}); }
  close() { this.child?.kill(); }
}
