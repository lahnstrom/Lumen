import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workspaceIndex, searchWorkspace, searchExcerpt } from '../src/workspace-search.js';
const topics = [{ id: 'a', title: 'Cardiac study', sources: [{ id: 's', title: 'Acquisition guide', content: 'Other material. '.repeat(30) + 'Rotate the marker while keeping the location fixed.' }], graph: { nodes: [{ id: 'n', label: 'Rotation', description: 'Probe movement' }] }, cards: [{ id: 'c', front: 'What moves during rotation?', back: 'Secret marker answer', source: 'Acquisition guide' }] }, { id: 'b', title: 'Rotation', sources: [], cards: [], graph: { nodes: [] } }];
test('workspace search crosses spaces and matches source contents and hidden answers', () => {
  const index = workspaceIndex(topics);
  assert.equal(searchWorkspace(index, 'marker cardiac').length, 2);
  assert.deepEqual(searchWorkspace(index, 'rotation', 'topic').map(r => r.topicId), ['b']);
  const card = searchWorkspace(index, 'secret')[0];
  assert.equal(card.kind, 'card');
  assert.equal(searchExcerpt(card, 'secret'), 'Acquisition guide');
  assert.ok(!JSON.stringify({ title: card.title, preview: searchExcerpt(card, 'secret') }).includes('Secret marker answer'));
  assert.equal(searchWorkspace(index, '  ').length, 0);
});
test('source previews expose matching passages, while titles outrank incidental matches', () => {
  const index = workspaceIndex(topics);
  const source = searchWorkspace(index, 'marker', 'source')[0];
  assert.match(searchExcerpt(source, 'marker'), /Rotate the marker/);
  assert.ok(searchExcerpt(source, 'marker').length <= 182);
  assert.equal(searchWorkspace(index, 'rotation')[0].title, 'Rotation');
  assert.deepEqual(topics[0].cards[0].back, 'Secret marker answer');
});
