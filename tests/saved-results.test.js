import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySavedResult } from '../src/saved-results.js';
const topic = { id: 't', cards: [], sources: [], graph: { nodes: [], edges: [] } };
test('save acknowledgments insert and replace topic data without mutating prior state', () => {
  const db = { topics: [], reviews: [] };
  const first = applySavedResult(db, '/topics', topic);
  assert.equal(first.topics.length, 1); assert.equal(db.topics.length, 0);
  const updated = { ...topic, sources: [{ id: 'source', title: 'Saved source' }] };
  const next = applySavedResult(first, '/topics/t/sources', updated);
  assert.equal(next.topics.length, 1); assert.equal(next.topics[0].sources.length, 1);
  assert.equal(first.topics[0].sources.length, 0);
});
test('review receipts reconcile only the reviewed card with actual host history', () => {
  const unrelated = { id: 'other', topicId: 'elsewhere', cardId: 'card' };
  const db = { topics: [topic], reviews: [unrelated, { id: 'old', topicId: 't', cardId: 'card' }] };
  const review = { id: 'confirmed', topicId: 't', cardId: 'card', grade: 'good' };
  const response = { ...topic, cards: [{ id: 'card', due: '2026-10-01', reviews: 1 }], saved: true, reviewReceipt: { cardId: 'card', reviews: [review] } };
  const next = applySavedResult(db, '/topics/t/cards/card/review', response);
  assert.deepEqual(next.reviews, [unrelated, review]);
  assert.equal(next.topics[0].cards[0].due, '2026-10-01');
  assert.equal(next.topics[0].reviewReceipt, undefined);
  assert.deepEqual(applySavedResult(next, '/topics/t/cards/card/review', response), next);
  assert.equal(applySavedResult(db, '/topics/t/cards/card/review', { saved: true }), db);
});
test('confirmed graph and cross-space updates remain available before the next refresh', () => {
  const db = { topics: [topic], reviews: [], conceptLinks: [{ id: 'link', label: 'Old' }] };
  const graph = { nodes: [{ id: 'n', label: 'Saved' }], edges: [] };
  const next = applySavedResult(db, '/topics/t/graph/layout', graph);
  assert.equal(next.topics[0].graph, graph);
  assert.equal(applySavedResult(next, '/concept-links/link', { id: 'link', label: 'New' }).conceptLinks[0].label, 'New');
  assert.deepEqual(applySavedResult(next, '/concept-links/link', []).conceptLinks, []);
});
