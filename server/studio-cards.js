import { httpUrl } from '../shared/urls.js';
import { randomUUID } from 'node:crypto';
import { newSchedule } from './scheduler.js';
const clozes = text => [...text.matchAll(/\{\{c([1-9]\d*)::([^{}]+?)\}\}/g)];
const plain = (text, index, answer) => text.replace(/\{\{c([1-9]\d*)::([^{}]+?)\}\}/g, (_, n, body) => {
  const [value, hint] = body.split('::'); return Number(n) === index && !answer ? `[${hint || '…'}]` : value;
});
export function studioCards(project) {
  const cards = [];
  for (const note of project.clozes || []) {
    if (!note.enabled) continue;
    const indices = [...new Set(clozes(note.text).map(m => Number(m[1])))].sort((a, b) => a - b);
    for (const index of indices) cards.push({
      kind: 'cloze', front: plain(note.text, index, false), back: plain(note.text, index, true) + (note.extra ? '\n\n' + note.extra : ''),
      source: project.source || project.title, evidence: note.evidence || '',
      cloze: { text: note.text, index, extra: note.extra },
      studio: { projectId: project.id, noteId: note.id, key: `cloze:${note.id}:${index}`, title: project.title },
    });
  }
  for (const image of project.images || []) {
    if (!image.enabled) continue;
    for (const region of image.regions || []) cards.push({
      kind: 'occlusion', front: 'Identify the highlighted label.', back: region.label || 'Recall the label revealed in the diagram.',
      source: image.source || project.source || project.title,
      occlusion: { imageUrl: `/studio/api/projects/${project.id}/images/${image.id}`, width: image.width, height: image.height, regions: structuredClone(image.regions), active: region.id, mode: image.mode, caption: image.caption },
      studio: { projectId: project.id, imageId: image.id, regionId: region.id, key: `occlusion:${image.id}:${region.id}`, title: project.title },
    });
  }
  return cards;
}
export function importStudioCards(topic, project, now = new Date()) {
  const incoming = studioCards(project); const keys = new Set(incoming.map(c => c.studio.key));
  if (!incoming.length && !topic.cards.some(c => c.studio?.projectId === project.id)) throw new Error('Enable at least one cloze or image mask in Studio before adding it to Lumen.');
  let added = 0, updated = 0, suspended = 0;
  for (const card of incoming) {
    const existing = topic.cards.find(c => c.studio?.projectId === project.id && c.studio.key === card.studio.key);
    if (existing) { Object.assign(existing, card, { suspended: false }); updated++; }
    else { topic.cards.push({ ...card, id: randomUUID(), ...newSchedule(now) }); added++; }
  }
  // Removed/unchecked Studio cards retain their memory history but leave the active queue.
  for (const c of topic.cards) if (c.studio?.projectId === project.id && !keys.has(c.studio.key)) { c.suspended = true; suspended++; }
  topic.studioProjects = [...new Set([...(topic.studioProjects || []), project.id])];
  const source = { id: `studio-${project.id}`, kind: 'note', title: project.title, content: project.text, url: httpUrl(project.source) ? project.source : '', note: 'Source from Flashcard Studio', addedAt: new Date(now).toISOString() };
  const existingSource = topic.sources.find(s => s.id === source.id);
  if (existingSource) Object.assign(existingSource, source); else topic.sources.push(source);
  return { added, updated, suspended, topicId: topic.id };
}
