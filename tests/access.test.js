import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAccessPolicy } from '../server/access.js';
const remote = 'https://study.example.ts.net';
const policy = createAccessPolicy({ LUMEN_TAILSCALE_ORIGIN: remote, LUMEN_TAILSCALE_USERS: 'learner@example.com' });
function check(headers, gate = policy) { let status = 200; const res = { status(s) { status = s; return this; }, json() {} }; gate({ headers }, res, () => {}); return status; }
test('Tailscale origin and authorized identity allow phone requests', () => {
  assert.equal(check({ host: 'study.example.ts.net', origin: remote, 'tailscale-user-login': 'learner@example.com' }), 200);
  assert.equal(check({ host: '127.0.0.1:4317', origin: remote, 'tailscale-user-login': 'learner@example.com' }), 200);
});
test('reject unknown identities, missing identity, foreign origins and unknown hosts', () => {
  assert.equal(check({ host: 'study.example.ts.net' }), 403);
  assert.equal(check({ host: 'study.example.ts.net', 'tailscale-user-login': 'stranger@example.com' }), 403);
  assert.equal(check({ host: 'study.example.ts.net', origin: 'https://attacker.example', 'tailscale-user-login': 'learner@example.com' }), 403);
  assert.equal(check({ host: 'attacker.example', 'tailscale-user-login': 'learner@example.com' }), 403);
  assert.equal(check({ host: '127.0.0.1:4317', origin: remote }), 403);
});
test('local access remains available and remote access is disabled by default', () => {
  assert.equal(check({ host: 'localhost:4317', origin: 'http://localhost:4317' }), 200);
  assert.equal(check({ host: 'study.example.ts.net', 'tailscale-user-login': 'learner@example.com' }, createAccessPolicy({})), 403);
  assert.throws(() => createAccessPolicy({ LUMEN_TAILSCALE_ORIGIN: remote }));
  assert.throws(() => createAccessPolicy({ LUMEN_TAILSCALE_ORIGIN: 'http://study.example.ts.net', LUMEN_TAILSCALE_USERS: 'learner@example.com' }));
});

test('explicit Tailscale HTTPS ports are allowed without allowing other ports', () => {
  const gate = createAccessPolicy({ LUMEN_TAILSCALE_ORIGIN: remote + ':8443', LUMEN_TAILSCALE_USERS: 'learner@example.com' });
  assert.equal(check({ host: 'study.example.ts.net:8443', origin: remote + ':8443', 'tailscale-user-login': 'learner@example.com' }, gate), 200);
  assert.equal(check({ host: 'study.example.ts.net:443', origin: remote, 'tailscale-user-login': 'learner@example.com' }, gate), 403);
});
