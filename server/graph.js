export function validateGraph(graph, cards = []) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || graph.nodes.length > 50 || graph.edges.length > 250) throw new Error('Use at most 50 concepts and 250 connections per space.');
  const ids = new Set(graph.nodes.map(n => n.id));
  if (ids.size !== graph.nodes.length || graph.nodes.some(n => typeof n.id !== 'string' || !n.id || typeof n.label !== 'string' || !n.label.trim() || n.label.length > 200 || (n.description && typeof n.description !== 'string'))) throw new Error('Each concept needs a unique identity and a name.');
  if (graph.edges.some(e => !ids.has(e.from) || !ids.has(e.to) || typeof e.label !== 'string')) throw new Error('Every connection needs two existing concepts and a relationship.');
  for (const n of graph.nodes) {
    if (n.position) validatePosition(n.position);
    if (n.cardIds && (!Array.isArray(n.cardIds) || n.cardIds.some(id => !cards.some(c => c.id === id)))) throw new Error('Linked flashcards must belong to this space.');
  }
  return graph;
}
export function validatePosition(p) { if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 100000 || Math.abs(p.y) > 100000) throw new Error('Invalid concept position.'); }
export function validConceptLink(db, link) {
  return db.topics.some(t => t.id === link.fromTopic && t.graph.nodes.some(n => n.id === link.fromNode)) && db.topics.some(t => t.id === link.toTopic && t.graph.nodes.some(n => n.id === link.toNode));
}
export function pruneConceptLinks(db) { db.conceptLinks = (db.conceptLinks || []).filter(l => validConceptLink(db, l)); }
