export function validateGraph(graph, cards = []) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || graph.nodes.length > 50 || graph.edges.length > 250) throw new Error('Use at most 50 concepts and 250 connections per space.');
  const ids = new Set(graph.nodes.map(n => n.id));
  if (ids.size !== graph.nodes.length || graph.nodes.some(n => typeof n.id !== 'string' || !n.id || typeof n.label !== 'string' || !n.label.trim() || n.label.length > 200 || (n.description && typeof n.description !== 'string'))) throw new Error('Each concept needs a unique identity and a name.');
  if (graph.edges.some(e => !ids.has(e.from) || !ids.has(e.to) || typeof e.label !== 'string' || (e.source !== undefined && typeof e.source !== 'string'))) throw new Error('Every connection needs two existing concepts and a relationship.');
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
export function conceptLinkFields(body) {
  if (typeof body.label !== 'string' || !body.label.trim() || body.label.trim().length > 120) throw new Error('Use a relationship name of 1–120 characters.');
  if (body.source !== undefined && (typeof body.source !== 'string' || body.source.length > 2000)) throw new Error('Use a source title or URL of at most 2,000 characters.');
  return { label: body.label.trim(), source: (body.source || '').trim() };
}

// Generated material grows a map. Only the explicit graph editor removes or rewrites it.
export function mergeLearningGraph(graph, incomingNodes = [], incomingEdges = []) {
  const nodes = [...graph.nodes], edges = [...graph.edges], aliases = new Map();
  const normalize = text => String(text || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  const ids = new Set(nodes.map(n => n.id));
  let skipped = 0;
  for (const candidate of incomingNodes) {
    if (!candidate || typeof candidate.id !== 'string' || !candidate.id.trim() || typeof candidate.label !== 'string' || !candidate.label.trim() || candidate.label.length > 200 || aliases.has(candidate.id)) { skipped++; continue; }
    const sameLabel = nodes.filter(n => normalize(n.label) === normalize(candidate.label));
    const match = sameLabel.find(n => n.id === candidate.id) || (sameLabel.length === 1 ? sameLabel[0] : null);
    if (match) { aliases.set(candidate.id, match.id); continue; }
    if (nodes.length >= 50) { skipped++; continue; }
    let nextId = candidate.id;
    // A reused generated ID with a different label must not overwrite another concept.
    if (ids.has(nextId)) { let suffix = 2; while (ids.has(`${candidate.id}-${suffix}`)) suffix++; nextId = `${candidate.id}-${suffix}`; }
    nodes.push({ id: nextId, label: candidate.label.trim(), description: typeof candidate.description === 'string' ? candidate.description : '' });
    ids.add(nextId); aliases.set(candidate.id, nextId);
  }
  const edgeKey = edge => JSON.stringify([edge.from, edge.to, normalize(edge.label)]);
  const edgeKeys = new Set(edges.map(edgeKey));
  for (const candidate of incomingEdges) {
    if (!candidate || typeof candidate.label !== 'string' || !candidate.label.trim() || (candidate.source !== undefined && typeof candidate.source !== 'string')) { skipped++; continue; }
    const edge = { from: aliases.get(candidate.from) || candidate.from, to: aliases.get(candidate.to) || candidate.to, label: candidate.label.trim(), source: candidate.source || '' };
    // If a supplied node was rejected, do not accidentally connect a same-ID old concept.
    const rejected = [candidate.from, candidate.to].some(id => incomingNodes.some(n => n?.id === id) && !aliases.has(id));
    if (rejected || !ids.has(edge.from) || !ids.has(edge.to)) { skipped++; continue; }
    const key = edgeKey(edge); if (edgeKeys.has(key)) continue;
    if (edges.length >= 250) { skipped++; continue; }
    edges.push(edge); edgeKeys.add(key);
  }
  return { graph: { ...graph, nodes, edges }, skipped };
}
