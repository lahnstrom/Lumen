import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, layoutGraph, neighborhood, canvasExport } from '../src/graph-model.js';
import { validateGraph, validatePosition, pruneConceptLinks } from '../server/graph.js';
const topics = [
  { id: 'a', title: 'Heart', cards: [], graph: { nodes: [{ id: 'same', label: 'Pressure', description: 'Cardiac pressure' }, { id: 'flow', label: 'Flow' }], edges: [{ from: 'same', to: 'flow', label: 'drives' }] } },
  { id: 'b', title: 'Lung', cards: [], graph: { nodes: [{ id: 'same', label: 'Pressure', description: 'Airway pressure' }], edges: [] } },
];
test('atlas preserves identities across topics and only joins explicitly linked concepts', () => {
  const link = { id: 'link', fromTopic: 'a', fromNode: 'same', toTopic: 'b', toNode: 'same', label: 'compare' };
  const graph = buildGraph(topics, [link], 'a', true); assert.equal(graph.nodes.length, 3); assert.equal(new Set(graph.nodes.map(n => n.id)).size, 3); assert.equal(graph.edges.length, 2);
  assert.equal(buildGraph(topics, [link], 'a').nodes.length, 2);
  assert.deepEqual([...neighborhood(graph.nodes, graph.edges, 'b::same')].sort(), ['a::same', 'b::same']);
  const db = { topics, conceptLinks: [link, { ...link, toNode: 'missing' }] }; pruneConceptLinks(db); assert.equal(db.conceptLinks.length, 1);
});
test('automatic layouts handle cycles and disconnected concepts and export valid canvas topology', () => {
  const graph = buildGraph(topics, [], 'a', true); graph.edges.push({ id: 'cycle', source: 'a::flow', target: 'a::same', label: 'feeds back' });
  const nodes = layoutGraph(graph.nodes, graph.edges); nodes.forEach(n => { assert.ok(Number.isFinite(n.position.x)); assert.ok(Number.isFinite(n.position.y)); });
  assert.equal(new Set(nodes.map(n => JSON.stringify(n.position))).size, nodes.length);
  const canvas = canvasExport(nodes, graph.edges); assert.equal(canvas.nodes.length, 3); assert.ok(canvas.edges.every(e => canvas.nodes.some(n => n.id === e.fromNode) && canvas.nodes.some(n => n.id === e.toNode)));
});
test('graph validation rejects invalid coordinates, dangling edges and foreign flashcards', () => {
  assert.throws(() => validatePosition({ x: Infinity, y: 0 })); assert.throws(() => validateGraph({ nodes: [], edges: [{ from: 'missing', to: 'missing', label: 'x' }] }));
  assert.throws(() => validateGraph({ nodes: [{ id: 'a', label: 'A', cardIds: ['other'] }], edges: [] }, []));
  assert.equal(validateGraph(topics[0].graph).nodes.length, 2);
});
