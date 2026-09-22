import React, { useState } from 'react';
import { ArrowUpRight, BookOpen, Loader2, Plus } from 'lucide-react';

export function StudioWorkspace({ topic, projectId, createProject, fail }) {
  const [project, setProject] = useState(projectId || topic?.studioProjects?.[0] || '');
  const [busy, setBusy] = useState(false);
  const query = new URLSearchParams({ embedded: '1' });
  if (topic) query.set('topic', topic.id);
  if (project) query.set('project', project);
  return <section className="studio-workspace"><div className="studio-toolbar"><div><strong>Flashcard Studio</strong><span>Cloze cards · image occlusion · Anki packages</span></div>{topic && <button className="button secondary" disabled={busy} onClick={async () => { setBusy(true); try { const r = await createProject(); setProject(r.projectId); } catch (e) { fail(e); } finally { setBusy(false); } }}>{busy ? <Loader2 size={15} className="spin"/> : <BookOpen size={15}/>}Use topic sources</button>}<a className="button secondary" href={`/studio/?${query}`} target="_blank" rel="noreferrer">Open full editor<ArrowUpRight size={15}/></a></div><iframe key={project} title="Flashcard Studio" src={`/studio/?${query}`} className="studio-frame"/></section>;
}
export function CardFace({ card, answer = false }) {
  if (card.kind === 'cloze' && card.cloze) {
    const { text, index, extra } = card.cloze; const parts = []; const re = /\{\{c([1-9]\d*)::([^{}]+?)\}\}/g; let pos = 0;
    for (const m of text.matchAll(re)) {
      parts.push(text.slice(pos, m.index)); const [value, hint] = m[2].split('::');
      parts.push(Number(m[1]) === index ? <mark key={m.index}>{answer ? value : `[${hint || '…'}]`}</mark> : value); pos = m.index + m[0].length;
    }
    parts.push(text.slice(pos));
    return <div className="cloze-face">{parts}{answer && extra && <p className="card-extra">{extra}</p>}</div>;
  }
  if (card.kind === 'occlusion' && card.occlusion) {
    const o = card.occlusion;
    const regions = o.regions.filter(r => o.mode === 'oa' ? r.id === o.active && !answer : !(answer && r.id === o.active));
    return <div className="occlusion-face"><p>{answer ? card.back : card.front}</p><div className="occlusion-image"><img src={o.imageUrl} alt={answer ? 'Diagram with the target label revealed' : 'Diagram for label recall'}/><svg viewBox={`0 0 ${o.width} ${o.height}`} preserveAspectRatio="none" aria-hidden="true">{regions.map(r => <rect key={r.id} x={r.x * o.width} y={r.y * o.height} width={r.width * o.width} height={r.height * o.height} fill={r.id === o.active ? '#f38e80' : '#eee1a6'} stroke="#536348" strokeWidth="1"/>)}</svg></div>{answer && o.caption && <p className="card-extra">{o.caption}</p>}</div>;
  }
  return <div className="plain-card-face">{answer ? card.back : card.front}</div>;
}
