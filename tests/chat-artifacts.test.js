import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLearningReply, streamedReply, saveLearningReply, recoverUnappliedBundles } from '../server/chat-artifacts.js';
import { newTopic } from '../server/domain.js';
const bundle = { reply: 'I created your flashcards.', sources: [], nodes: [], edges: [], cards: [{ front: 'What is retrieval?', back: 'Recall from memory.', source: 'Your notes' }] };
test('conversational card requests save real FSRS cards and preserve an existing concept map', () => {
  const t = newTopic('Study'); t.graph = { nodes: [{ id: 'x', label: 'Existing' }], edges: [] };
  const saved = saveLearningReply(t, parseLearningReply(JSON.stringify(bundle)));
  assert.equal(t.cards.length, 1); assert.equal(t.cards[0].fsrs.state, 0); assert.equal(t.graph.nodes[0].id, 'x');
  assert.equal(saved.content, bundle.reply); assert.equal(saved.artifacts.cards, 1);
});
test('streaming exposes natural text rather than the JSON container', () => {
  const raw = JSON.stringify({ ...bundle, reply: 'A line\nwith "quotes" and ü.' });
  let last = '';
  for (let i = 0; i < raw.length; i++) { const value = streamedReply(raw.slice(0, i)); if (value !== null) last = value; assert.ok(!last.includes('"cards":')); }
  assert.equal(last, 'A line\nwith "quotes" and ü.');
});
test('legacy JSON responses recover once, with duplicate protection', () => {
  const t = newTopic('Study'); t.messages.push({ role: 'assistant', content: JSON.stringify(bundle) });
  const db = { topics: [t] }; assert.equal(recoverUnappliedBundles(db), 1); assert.equal(recoverUnappliedBundles(db), 0);
  assert.equal(t.cards.length, 1); assert.equal(t.messages[0].content, bundle.reply); assert.ok(t.messages[0].recoveredAt);
  saveLearningReply(t, bundle); assert.equal(t.cards.length, 1);
});
test('ordinary prose and invalid envelopes never become card data', () => {
  assert.equal(parseLearningReply('Let us discuss learning.'), null);
  assert.equal(parseLearningReply(JSON.stringify({ ...bundle, cards: [{ front: 7 }] })), null);
});
