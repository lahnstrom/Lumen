import { newSchedule } from './scheduler.js';
import { randomUUID } from 'node:crypto';
export const id = () => randomUUID();
export const newTopic = title => ({ id: id(), title, createdAt: new Date().toISOString(), messages: [], sources: [], cards: [], graph: { nodes: [], edges: [] }, threadId: null });
export function ankiExport(topic) {
  const clean = s => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\t/g, ' ').replace(/\r?\n/g, '<br>');
  return '#separator:Tab\n#html:true\n#tags column:3\n#columns:Front\tBack\tTags\n' + topic.cards.map(c => [clean(c.front), clean(c.back) + (c.source ? '<br><br>Source: ' + clean(c.source) : ''), 'Lumen::' + topic.title.replace(/[^\p{L}\p{N}_-]/gu, '_')].join('\t')).join('\n');
}
export const bundleSchema = {
  type: 'object', additionalProperties: false, required: ['reply', 'sources', 'nodes', 'edges', 'cards'], properties: {
    reply: { type: 'string' },
    sources: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'url', 'note'], properties: { title: { type: 'string' }, url: { type: 'string' }, note: { type: 'string' } } } },
    nodes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'label', 'description'], properties: { id: { type: 'string' }, label: { type: 'string' }, description: { type: 'string' } } } },
    edges: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['from', 'to', 'label', 'source'], properties: { from: { type: 'string' }, to: { type: 'string' }, label: { type: 'string' }, source: { type: 'string' } } } },
    cards: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['front', 'back', 'source'], properties: { front: { type: 'string' }, back: { type: 'string' }, source: { type: 'string' } } } }
  }
};
export function applyBundle(topic, bundle, mode) {
  if (typeof bundle.reply !== 'string') throw new Error('Codex returned an invalid learning bundle.');
  for (const s of bundle.sources || []) {
    if (!/^https?:\/\//i.test(s.url)) continue;
    if (!topic.sources.some(old => old.url === s.url)) topic.sources.push({ ...s, id: id(), kind: 'web', addedAt: new Date().toISOString() });
  }
  if (mode === 'build') {
    const nodes = (bundle.nodes || []).slice(0, 16);
    const ids = new Set(nodes.map(n => n.id));
    topic.graph = { nodes, edges: (bundle.edges || []).filter(e => ids.has(e.from) && ids.has(e.to)) };
    for (const c of bundle.cards || []) if (c.front && c.back && !topic.cards.some(old => old.front === c.front)) topic.cards.push({ ...c, id: id(), ...newSchedule() });
  }
  return bundle.reply;
}
