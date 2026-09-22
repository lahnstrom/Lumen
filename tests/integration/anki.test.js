import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { AnkiBridge } from '../../server/anki.js';
import { newSchedule } from '../../server/scheduler.js';

test('Lumen and external Anki answers share a real Anki scheduler and review log', { timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lumen-real-anki-'));
  const child = spawn('studio/.venv/bin/python', ['tests/fixtures/anki_collection.py', directory], { stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = []; let errors = '';
  child.stderr.on('data', s => { errors += s; });
  createInterface({ input: child.stdout }).on('line', line => { if (!line.startsWith('{')) return; const value = JSON.parse(line); const next = pending.shift(); value.error ? next.reject(new Error(value.error)) : next.resolve(value.result); });
  child.on('exit', () => { for (const next of pending.splice(0)) next.reject(new Error(errors || 'Test Anki exited')); });
  const invoke = (action, params = {}) => new Promise((resolve, reject) => { pending.push({ resolve, reject }); child.stdin.write(JSON.stringify({ action, params }) + '\n'); });
  try {
    const card = { id: 'integration-card', front: 'What owns this schedule?', back: 'The actual Anki scheduler.', ...newSchedule() };
    const db = { topics: [{ id: 'topic', title: 'Integration', cards: [card] }], reviews: [], anki: { enabled: false } };
    const bridge = new AnkiBridge({ db, save() {}, invoke });
    await bridge.connect(db.topics[0], 'Lumen integration');
    assert.ok(card.anki.cardId); assert.equal(card.anki.dueNow, true);
    const preview = await bridge.preview(card); assert.equal(preview.scheduler, 'anki'); assert.ok(preview.options.good.label);
    await bridge.answer(card, 'good', preview.token); await bridge.tail;
    assert.equal(card.anki.reps, 1); assert.equal(card.reviews, 1); assert.equal(db.reviews.length, 1); assert.equal(db.reviews[0].scheduler, 'anki');
    await invoke('answerCards', { answers: [{ cardId: card.anki.cardId, ease: 3 }] }); // A review made outside Lumen.
    await bridge.sync(); assert.equal(card.reviews, 2); assert.equal(db.reviews.length, 2);
    await bridge.sync(); assert.equal(db.reviews.length, 2);
    assert.equal((await invoke('findNotes', { query: 'tag:lumen' })).length, 1);
    const remote = (await invoke('cardsInfo', { cards: [card.anki.cardId] }))[0];
    assert.equal(card.interval, remote.interval); assert.equal(card.anki.due, remote.due);
    const bundle = await invoke('testStudioBundle');
    const studioCards = bundle.notes.flatMap(n => n.cards.map(c => ({ id: c.key, front: 'Studio card', back: 'Studio answer', ...newSchedule(), studio: { projectId: 'studio-project', key: c.key } })));
    const studioTopic = { id: 'studio-topic', title: 'Studio integration', cards: studioCards };
    db.topics.push(studioTopic); bridge.studioBundle = async () => bundle;
    await bridge.connect(studioTopic, 'Lumen integration');
    assert.equal(studioCards.length, 6); assert.ok(studioCards.every(c => c.anki?.cardId));
    assert.equal(new Set(studioCards.map(c => c.anki.cardId)).size, 6);
    assert.ok(studioCards.some(c => c.anki.question.includes('img')));
    for (const c of [studioCards[0], studioCards.at(-1)]) {
      const p = await bridge.preview(c); await bridge.answer(c, 'good', p.token); await bridge.tail;
      assert.equal(c.reviews, 1);
    }
    await bridge.sync(); assert.equal((await invoke('findNotes', { query: 'tag:flashcard_studio' })).length, bundle.notes.length);
  } finally {
    child.stdin.end(); if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve)); await rm(directory, { recursive: true, force: true });
  }
});
