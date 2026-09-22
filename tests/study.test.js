import test from 'node:test';
import assert from 'node:assert/strict';
import { isDue, isPaused, dueLabel, selectCards } from '../src/study.js';
const now = Date.parse('2026-09-22T12:00:00Z');
const cards = [
  { id: 'new', front: 'Doppler shift', back: 'Frequency change from motion', source: 'Ultrasound notes', reviews: 0, due: '2026-09-20T00:00:00Z' },
  { id: 'reviewed', front: 'Cardiac output', back: 'Volume per minute', source: 'Physiology', reviews: 4, due: '2026-10-20T00:00:00Z' },
  { id: 'paused', front: 'Flow', back: 'Movement', reviews: 2, due: '2026-09-20T00:00:00Z', suspended: true },
  { id: 'anki', front: 'Angle', back: 'A probe movement', reviews: 0, anki: { cardId: 123, dueNow: true, queue: -1 } },
  { id: 'missing', front: 'Tilt', back: 'Another movement', reviews: 0, anki: { cardId: 124, dueNow: true, missing: true } },
];
test('collection search combines terms across questions, hidden answers, and sources without changing cards', () => {
  const before = structuredClone(cards);
  assert.deepEqual(selectCards(cards, { query: ' ULTRASOUND   frequency ', now }).map(c => c.id), ['new']);
  assert.deepEqual(selectCards(cards, { query: 'cardiac', filter: 'ready', now }), []);
  assert.deepEqual(cards, before);
});
test('Anki suspension overrides a stale due flag; filters retain paused and missing cards for inspection', () => {
  assert.equal(isPaused(cards[3]), true); assert.equal(isDue(cards[3], now), false); assert.equal(isDue(cards[4], now), false);
  assert.equal(dueLabel(cards[2], now), 'Paused in Lumen'); assert.equal(dueLabel(cards[3], now), 'Suspended in Anki');
  assert.deepEqual(selectCards(cards, { filter: 'ready', now }).map(c => c.id), ['new']);
  assert.deepEqual(selectCards(cards, { filter: 'new', now }).map(c => c.id), ['new']);
  assert.deepEqual(selectCards(cards, { filter: 'paused', now }).map(c => c.id), ['paused', 'anki']);
  assert.deepEqual(selectCards(cards, { filter: 'unavailable', now }).map(c => c.id), ['missing']);
  assert.deepEqual(selectCards(cards, { filter: 'practised', sort: 'practised', now }).map(c => c.id), ['reviewed', 'paused']);
});
