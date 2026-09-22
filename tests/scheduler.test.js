import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyCard, fsrs, Rating } from 'ts-fsrs';
import { newSchedule, reviewOptions, scheduleResult, migrateWorkspace, PARAMETERS, State } from '../server/scheduler.js';
const start = new Date('2026-01-01T12:00:00Z');
test('new cards use Anki-style steps and Good graduates after 10 minutes', () => {
  const c = { id: 'c', ...newSchedule(start) }; const options = reviewOptions(c, start);
  assert.equal(options.again.card.due - start, 60000);
  assert.equal(options.hard.card.due - start, 360000);
  assert.equal(options.good.card.due - start, 600000);
  assert.equal(options.easy.card.state, State.Review);
  const learning = scheduleResult(c, options.good, 'good');
  const after = reviewOptions(JSON.parse(JSON.stringify(learning)), new Date(learning.due)).good;
  assert.equal(after.card.state, State.Review); assert.ok(after.card.scheduled_days >= 1);
  assert.equal(c.reviews, 0); assert.equal(learning.reviews, 1);
});
test('mature card outcomes agree with the library and lapses relearn', () => {
  const direct = fsrs(PARAMETERS); let memory = createEmptyCard(start);
  for (let n = 0; n < 5; n++) memory = direct.next(memory, memory.due, Rating.Good).card;
  const c = { ...newSchedule(), fsrs: JSON.parse(JSON.stringify(memory)) };
  const now = new Date(memory.due.getTime() + 5 * 86400000);
  const ours = reviewOptions(c, now); const expected = direct.repeat(memory, now);
  for (const [grade, rating] of Object.entries({ again: 1, hard: 2, good: 3, easy: 4 })) assert.deepEqual(ours[grade], expected[rating]);
  assert.equal(ours.again.card.state, State.Relearning); assert.equal(ours.again.card.lapses, memory.lapses + 1);
  assert.equal(ours.again.card.due - now, 600000);
  assert.ok(ours.easy.card.scheduled_days >= ours.good.card.scheduled_days);
});
test('legacy history is replayed while due dates and historical activity stay intact', () => {
  const due = '2026-02-01T12:00:00Z';
  const db = { topics: [{ id: 't', cards: [{ id: 'c', due, reviews: 2, interval: 10 }] }], reviews: [
    { topicId: 't', cardId: 'c', at: '2026-01-01T12:10:00Z', grade: 'good' },
    { topicId: 't', cardId: 'c', at: start.toISOString(), grade: 'good' },
  ] };
  const oldLogs = JSON.stringify(db.reviews); assert.equal(migrateWorkspace(db, start), true);
  const c = db.topics[0].cards[0]; assert.equal(c.due, due); assert.equal(Date.parse(c.fsrs.due), Date.parse(due));
  assert.equal(c.fsrs.reps, 2); assert.equal(c.fsrs.state, State.Review); assert.equal(c.reviews, 2);
  assert.equal(c.migration.replayedReviews, 2); assert.equal(JSON.stringify(db.reviews), oldLogs);
  assert.equal(migrateWorkspace(db, start), false);
});
test('missing legacy history starts a fresh memory estimate without inventing reviews', () => {
  const db = { topics: [{ id: 't', cards: [{ id: 'c', due: start.toISOString(), reviews: 10, interval: 20 }] }], reviews: [] };
  migrateWorkspace(db, start); const c = db.topics[0].cards[0];
  assert.equal(c.fsrs.state, State.New); assert.equal(c.fsrs.reps, 0); assert.equal(c.reviews, 10); assert.equal(c.migration.historyMissing, true);
});
