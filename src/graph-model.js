import dagre from '@dagrejs/dagre';
export const nodeKey = (topicId, nodeId) => `${topicId}::${nodeId}`;
export function buildGraph(topics, links = [], currentTopic, atlas = false) {
  const visible = atlas ? topics : topics.filter(t => t.id === currentTopic);
  const nodes = visible.flatMap(topic => topic.graph.nodes.map(node => ({
    id: nodeKey(topic.id, node.id), type: 'concept', position: node.position || { x: 0, y: 0 },
    data: { ...node, topicId: topic.id, topicTitle: topic.title, cards: topic.cards.filter(c => !c.suspended && node.cardIds?.includes(c.id)) },
  })));
  const ids = new Set(nodes.map(n => n.id));
  const edges = visible.flatMap(topic => topic.graph.edges.map((edge, i) => ({
    id: `${topic.id}:edge:${i}`, source: nodeKey(topic.id, edge.from), target: nodeKey(topic.id, edge.to), label: edge.label,
    data: { ...edge, topicId: topic.id },
  })));
  if (atlas) for (const link of links) edges.push({ id: link.id, source: nodeKey(link.fromTopic, link.fromNode), target: nodeKey(link.toTopic, link.toNode), label: link.label, data: { ...link, crossTopic: true } });
  return { nodes, edges: edges.filter(e => ids.has(e.source) && ids.has(e.target)) };
}
export function layoutGraph(nodes, edges, useSaved = true) {
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({ rankdir: 'LR', nodesep: 48, ranksep: 135, marginx: 30, marginy: 30 }); graph.setDefaultEdgeLabel(() => ({}));
  nodes.forEach(n => graph.setNode(n.id, { width: 236, height: 146 }));
  edges.forEach(e => graph.setEdge(e.source, e.target, { width: Math.min(180, String(e.label || '').length * 6), height: 24 }, e.id));
  dagre.layout(graph);
  return nodes.map(n => { const p = graph.node(n.id); return { ...n, position: useSaved && n.data.position ? n.data.position : { x: p.x - 118, y: p.y - 73 } }; });
}
export function neighborhood(nodes, edges, selected) {
  if (!selected) return new Set(nodes.map(n => n.id));
  const ids = new Set([selected]);
  edges.forEach(e => { if (e.source === selected) ids.add(e.target); if (e.target === selected) ids.add(e.source); });
  return ids;
}
export function canvasExport(nodes, edges) {
  return {
    nodes: nodes.map(n => ({ id: n.id, type: 'text', x: Math.round(n.position.x), y: Math.round(n.position.y), width: 270, height: 180, text: `# ${n.data.label}\n\n${n.data.description || ''}\n\nSpace: ${n.data.topicTitle}` })),
    edges: edges.map(e => ({ id: e.id, fromNode: e.source, fromSide: 'right', toNode: e.target, toSide: 'left', toEnd: 'arrow', label: e.label || '' })),
  };
}
