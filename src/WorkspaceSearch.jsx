import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, FileText, Layers, Network, Search } from 'lucide-react';
import { workspaceIndex, searchWorkspace, searchExcerpt } from './workspace-search.js';
const kinds = [['all', 'Everything'], ['topic', 'Spaces'], ['concept', 'Concepts'], ['source', 'Sources'], ['card', 'Cards']];
const icons = { topic: BookOpen, concept: Network, source: FileText, card: Layers };
export function WorkspaceSearch({ topics, open, close }) {
  const [query, setQuery] = useState(''), [kind, setKind] = useState('all'), [limit, setLimit] = useState(30);
  const root = useRef();
  const index = useMemo(() => workspaceIndex(topics), [topics]);
  const results = useMemo(() => searchWorkspace(index, query, kind), [index, query, kind]);
  useEffect(() => setLimit(30), [query, kind]);
  useEffect(() => {
    const dialog = root.current.closest('[role="dialog"]');
    function keyboard(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      if (e.key !== 'Tab') return;
      const elements = [...dialog.querySelectorAll('button:not(:disabled), input, [href]')];
      const first = elements[0], last = elements.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
    dialog.addEventListener('keydown', keyboard);
    return () => dialog.removeEventListener('keydown', keyboard);
  }, [close]);
  return <section ref={root} className="workspace-search-panel">
    <div className="eyebrow">ACROSS YOUR LEARNING SPACES</div><h2>Find a thread to follow</h2>
    <label className="library-search"><Search size={18}/><input autoFocus aria-label="Search saved knowledge" placeholder="A concept, a phrase, a source…" value={query} onChange={e => setQuery(e.target.value)} maxLength={300}/></label>
    <div className="library-filters" role="group" aria-label="Search categories">{kinds.map(([value, label]) => <button key={value} aria-pressed={value === kind} onClick={() => setKind(value)}>{label}</button>)}</div>
    <p className="search-count" role="status">{query.trim() ? `${results.length} results in your saved material` : 'Search topics, concepts, source text, questions, and answers.'}</p>
    <div className="workspace-search-results">{results.slice(0, limit).map(item => { const Icon = icons[item.kind]; return <button key={`${item.topicId}:${item.kind}:${item.id}`} className="workspace-search-result" onClick={() => open(item)}><Icon size={18}/><span><small>{item.topicTitle} · {item.kind === 'topic' ? 'Learning space' : item.kind}</small><strong>{item.title}</strong><span>{searchExcerpt(item, query)}</span></span><ArrowUpRight size={15}/></button>; })}
      {query.trim() && !results.length && <p className="search-empty">No matches yet. Try fewer words or another category.</p>}
      {results.length > limit && <button className="button secondary library-more" onClick={() => setLimit(n => n + 30)}>Show more results ({results.length - limit} remaining)</button>}
    </div><p className="fine-print">Searches saved Lumen material on this device. Imported Studio cards are included; projects not yet added to Lumen are in Studio. Browsing does not record reviews.</p>
  </section>;
}
