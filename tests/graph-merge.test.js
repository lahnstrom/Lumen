import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeLearningGraph, validateGraph, pruneConceptLinks } from '../server/graph.js';
import { newTopic } from '../server/domain.js';
import { saveLearningReply } from '../server/chat-artifacts.js';

test('new learning kits preserve manual concept details, positions, cards and cross-space links', () => {
  const topic = newTopic('Circulation'), other = newTopic('Imaging');
  topic.cards.push({ id: 'saved-card', front: 'What drives flow?', back: 'A gradient' });
  topic.graph = { nodes: [{ id: 'manual-pressure', label: 'Pressure gradient', description: 'My carefully edited explanation.', position: { x: 120, y: 180 }, cardIds: ['saved-card'] }, { id: 'existing-flow', label: 'Flow' }], edges: [{ from: 'manual-pressure', to: 'existing-flow', label: 'drives', source: 'My verified source' }] };
  other.graph = { nodes: [{ id: 'doppler', label: 'Doppler' }], edges: [] };
  const db = { topics: [topic, other], conceptLinks: [{ fromTopic: topic.id, fromNode: 'manual-pressure', toTopic: other.id, toNode: 'doppler', label: 'measured with' }] };
  const original = structuredClone(topic.graph);
  const bundle = { reply: 'Added resistance.', sources: [], cards: [{ front: 'What drives flow?', back: 'A gradient', source: '' }], nodes: [{ id: 'new-pressure', label: ' pressure   gradient ', description: 'Generated replacement.' }, { id: 'flow', label: 'Flow', description: 'Generated text' }, { id: 'resistance', label: 'Resistance', description: 'Opposition to flow.' }], edges: [{ from: 'new-pressure', to: 'flow', label: 'drives', source: 'New source' }, { from: 'resistance', to: 'flow', label: 'limits', source: 'Reference' }] };
  const first = saveLearningReply(topic, bundle); pruneConceptLinks(db);
  assert.deepEqual(topic.graph.nodes.slice(0, 2), original.nodes);
  assert.deepEqual(topic.graph.edges[0], original.edges[0]);
  assert.equal(topic.graph.edges[1].to, 'existing-flow');
  assert.deepEqual(first.artifacts, { cards: 0, concepts: 1, connections: 1 });
  assert.equal(db.conceptLinks.length, 1);
  validateGraph(topic.graph, topic.cards);
  const repeated = saveLearningReply(topic, bundle);
  assert.deepEqual(repeated.artifacts, { cards: 0, concepts: 0, connections: 0 });
  assert.equal(topic.graph.nodes.length, 3); assert.equal(topic.graph.edges.length, 2);
});
test('ID collisions cannot rewrite unrelated concepts, and edge-only additions work', () => {
  const graph = { nodes: [{ id: 'a', label: 'Anatomy' }, { id: 'b', label: 'Blood' }], edges: [] };
  const first = mergeLearningGraph(graph, [{ id: 'a', label: 'Acoustics' }], [{ from: 'a', to: 'b', label: 'illustrates' }]);
  assert.equal(first.graph.nodes[0].label, 'Anatomy');
  assert.equal(first.graph.nodes[2].id, 'a-2'); assert.equal(first.graph.edges[0].from, 'a-2');
  const repeated = mergeLearningGraph(first.graph, [{ id: 'a', label: 'Acoustics' }], [{ from: 'a', to: 'b', label: 'illustrates' }]);
  assert.deepEqual(repeated.graph, first.graph);
  const additional = mergeLearningGraph(first.graph, [], [{ from: 'a', to: 'b', label: 'contains' }]);
  assert.equal(additional.graph.edges.length, 2);
  assert.deepEqual(graph.edges, []);
});
test('full maps reject excess additions explicitly without dropping existing data', () => {
  const topic = newTopic('Full map');
  topic.graph.nodes = Array.from({ length: 50 }, (_, i) => ({ id: `n${i}`, label: `Concept ${i}` }));
  const bundle = { reply: 'A proposed extension.', sources: [], cards: [], nodes: [{ id: 'n0', label: 'Different concept' }], edges: [{ from: 'n0', to: 'n1', label: 'new relationship' }] };
  const saved = saveLearningReply(topic, bundle);
  assert.equal(topic.graph.nodes.length, 50); assert.equal(topic.graph.edges.length, 0);
  assert.match(saved.content, /2 proposed concepts or connections could not be added/);
  assert.deepEqual(saved.artifacts, { cards: 0, concepts: 0, connections: 0 });
});
test('connection limits preserve existing evidence and reject new edges without truncation', () => {
  const graph = { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: Array.from({ length: 250 }, (_, i) => ({ from: 'a', to: 'b', label: `Relationship ${i}`, source: 'Saved evidence' })) };
  const result = mergeLearningGraph(graph, [], [{ from: 'a', to: 'b', label: 'Relationship 0', source: 'Different evidence' }, { from: 'b', to: 'a', label: 'New connection', source: '' }]);
  assert.deepEqual(result.graph, graph); assert.equal(result.skipped, 1);
});
