import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learningSpaces } from '../src/learning-spaces.js';
const now = Date.parse('2026-09-22T12:00:00Z');
const card = fields => ({ due: new Date(now - 1000).toISOString(), reviews: 0, ...fields });
const topics = [
  { id: 'newest', title: 'Empty space', cards: [] },
  { id: 'paused', title: 'Paused space', cards: [card({ anki: { cardId: 1, queue: -1, dueNow: true } }), card({ anki: { missing: true } })] },
  { id: 'future', title: 'Future space', cards: [card({ due: new Date(now + 1000).toISOString(), reviews: 2 })] },
  { id: 'older', title: 'Older space', cards: [card({}), card({ reviews: 1 })] },
];
test('overview puts older due spaces first and excludes paused and unavailable cards', () => {
  const result = learningSpaces(topics, [], { now });
  assert.equal(result[0].topic.id, 'older'); assert.equal(result[0].ready, 2);
  const paused = result.find(s => s.topic.id === 'paused');
  assert.equal(paused.ready, 0); assert.equal(paused.active, 0); assert.equal(paused.paused, 1); assert.equal(paused.unavailable, 1);
  assert.deepEqual(learningSpaces(topics, [], { now, filter: 'ready' }).map(s => s.topic.id), ['older']);
  assert.equal(topics[0].id, 'newest');
});
test('filters, review ordering and scheduled return use actual review and due times', () => {
  const reviews = [{ topicId: 'future', at: new Date(now).toISOString() }, { topicId: 'older', at: new Date(now - 1000).toISOString() }];
  assert.equal(learningSpaces(topics, reviews, { now, sort: 'recent' })[0].topic.id, 'future');
  assert.deepEqual(learningSpaces(topics, reviews, { now, filter: 'unpractised' }).map(s => s.topic.id), ['older']);
  assert.equal(learningSpaces(topics, reviews, { now, query: 'future space' })[0].nextDue, now + 1000);
  assert.equal(learningSpaces(topics, reviews, { now: now + 1001, query: 'future' })[0].ready, 1);
});
