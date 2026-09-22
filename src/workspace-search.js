const normalized = value => String(value || '').toLocaleLowerCase();
export function workspaceIndex(topics) {
  return topics.flatMap(topic => {
    const item = (kind, id, title, text, detail) => ({ kind, id, topicId: topic.id, topicTitle: topic.title, title, text: normalized([title, text, topic.title].join(' ')), detail });
    return [
      item('topic', topic.id, topic.title, '', 'Open conversation'),
      ...(topic.sources || []).map(s => item('source', s.id, s.title, [s.content, s.note, s.url].join(' '), s.content || s.note || s.url || 'Saved source')),
      ...(topic.graph?.nodes || []).map(n => item('concept', n.id, n.label, n.description, n.description || 'Explore connections')),
      ...(topic.cards || []).map(c => item('card', c.id, c.front, [c.back, c.source, c.cloze?.text, c.occlusion?.caption].join(' '), c.source || 'Flashcard · answer hidden')),
    ];
  });
}
export function searchWorkspace(index, query, kind = 'all') {
  const terms = normalized(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return index.filter(item => (kind === 'all' || item.kind === kind) && terms.every(term => item.text.includes(term)))
    .map(item => ({ ...item, rank: terms.reduce((n, term) => n + (normalized(item.title).includes(term) ? 1 : 0), 0) }))
    .sort((a, b) => b.rank - a.rank || a.title.localeCompare(b.title));
}
export function searchExcerpt(item, query) {
  const text = String(item.detail || '').replace(/\s+/g, ' ');
  // Never extract a hidden answer into a search preview.
  const term = item.kind === 'card' ? '' : normalized(query).trim().split(/\s+/).find(t => normalized(text).includes(t));
  const start = term ? Math.max(0, normalized(text).indexOf(term) - 55) : 0;
  return `${start ? '…' : ''}${text.slice(start, start + 180)}${text.length > start + 180 ? '…' : ''}`;
}
