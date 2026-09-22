import React, { useEffect, useState } from 'react';
import { ArrowUpRight, BookOpen, Search, Flame, Layers, Network, Sprout } from 'lucide-react';
import { learningSpaces } from './learning-spaces.js';
const dayKey = value => new Date(value).toLocaleDateString('sv-SE');
export function LearningOverview({ db, openTopic, review, now = Date.now() }) {
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all'), [sort, setSort] = useState('ready'), [limit, setLimit] = useState(6);
  useEffect(() => setLimit(6), [query, filter, sort]);
  const spaces = learningSpaces(db.topics, db.reviews, { now });
  const visible = learningSpaces(db.topics, db.reviews, { query, filter, sort, now });
  if (!db.topics.length) return null;
  const due = spaces.reduce((sum, space) => sum + space.ready, 0);
  const today = db.reviews.filter(r => dayKey(r.at) === dayKey(now)).length;
  return <section className="learning-overview" aria-label="Your learning overview">
    <div className="overview-heading"><h2>Pick up where you left off</h2><span>{today ? `${today} reviews today` : 'A little practice goes a long way'}</span></div>
    <div className="overview-metrics"><span><Layers size={15}/><strong>{due}</strong>ready to recall</span><span><Network size={15}/><strong>{db.topics.reduce((n, t) => n + t.graph.nodes.length, 0)}</strong>connected concepts</span><span><Sprout size={15}/><strong>{db.reviews.length}</strong>recall attempts</span></div>
    <div className="overview-tools"><label className="library-search"><Search size={15}/><input aria-label="Find a learning space" placeholder="Find a learning space…" value={query} onChange={e => setQuery(e.target.value)}/></label><label className="library-sort">Sort<select aria-label="Sort learning spaces" value={sort} onChange={e => setSort(e.target.value)}><option value="ready">Ready first</option><option value="recent">Recently reviewed</option><option value="alphabetical">Alphabetical</option></select></label></div>
    <div className="library-filters" role="group" aria-label="Filter learning spaces">{[['all', 'All spaces'], ['ready', 'Ready to review'], ['unpractised', 'Cards to begin']].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
    <p className="overview-result-count" role="status">{visible.length} of {db.topics.length} learning spaces{sort === 'ready' ? ' · Most cards ready first' : ''}</p>
    {db.topics.some(t => t.anki?.enabled) && !db.anki?.connected && <p className="sync-notice">Anki is unavailable. Linked review counts show the last synchronized state; open desktop Anki to refresh them.</p>}
    <div className="space-cards">{visible.slice(0, limit).map(({ topic: t, active, ready, practised, paused, unavailable, nextDue, lastReview }) => <article className="space-card" key={t.id} aria-label={t.title}>
      <div className="space-card-top"><BookOpen size={18}/><span>{t.anki?.enabled ? 'ANKI CONNECTED' : 'LEARNING SPACE'}</span></div>
      <button className="space-title" onClick={() => openTopic(t.id)}>{t.title}<ArrowUpRight size={16}/></button>
      <p>{t.sources.length} sources · {t.graph.nodes.length} concepts · {active} available cards</p>
      {(paused > 0 || unavailable > 0) && <p className="space-extra-status">{[paused > 0 && `${paused} paused`, unavailable > 0 && `${unavailable} unavailable`].filter(Boolean).join(' · ')}</p>}
      <div className="space-recall-progress" aria-label={`${practised} of ${active} available cards practised`}><span style={{ width: `${active ? 100 * practised / active : 0}%` }}/></div>
      <div className="space-card-bottom"><span>{practised ? `${practised} cards practised` : 'Ready for your curiosity'}</span>{ready > 0 && <button onClick={() => review(t.id)}>Review {ready}<ArrowUpRight size={13}/></button>}</div>
      <p className="space-review-time">{lastReview ? `Last reviewed ${new Date(lastReview).toLocaleDateString()}` : 'No reviews yet'}{!ready && nextDue ? ` · Next due ${new Date(nextDue).toLocaleDateString()}` : ''}</p>
    </article>)}</div>
    {!visible.length && <div className="overview-empty"><p>{filter === 'ready' && !query ? 'Nothing is ready right now. Come back when your cards are due, or explore another topic.' : 'No spaces match this view.'}</p><button className="text-button" onClick={() => { setQuery(''); setFilter('all'); }}>Show all learning spaces</button></div>}
    {visible.length > limit && <button className="button secondary library-more" onClick={() => setLimit(n => n + 6)}>Show more spaces ({visible.length - limit} remaining)</button>}
  </section>;
}
export function Activity({ reviews, topics }) {
  const counts = new Map(); for (const r of reviews) counts.set(dayKey(r.at), (counts.get(dayKey(r.at)) || 0) + 1);
  const days = Array.from({ length: 28 }, (_, i) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - 27 + i); return { key: dayKey(d), label: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) }; });
  const recent = [...reviews].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 8);
  return <div className="activity-layout"><section className="activity-calendar"><div className="activity-title"><div><h3>The rhythm of learning</h3><p>Your last four weeks of retrieval practice</p></div><Flame size={22}/></div><div className="activity-days">{days.map(d => { const count = counts.get(d.key) || 0; return <div key={d.key} tabIndex={0} title={`${d.label}: ${count} reviews`} aria-label={`${d.label}: ${count} reviews`} className={`activity-day level-${Math.min(3, Math.ceil(count / 5))}`}><span>{Number(d.key.slice(-2))}</span><small>{count || '·'}</small></div>; })}</div><div className="activity-legend"><span>Less</span>{[0, 1, 2, 3].map(n => <i className={`level-${n}`} key={n}/>)}<span>More</span></div></section><section className="recent-reviews"><h3>Recent recall</h3>{!recent.length && <p>Your first review is the beginning of a useful habit.</p>}{recent.map(r => { const t = topics.find(t => t.id === r.topicId), c = t?.cards.find(c => c.id === r.cardId); return <div className="recent-review" key={r.id}><span className={`grade-dot ${r.grade}`}/><div><strong>{c?.front || 'Archived flashcard'}</strong><small>{t?.title || 'Archived space'} · {r.scheduler === 'anki' ? 'Anki' : 'Lumen'} · {new Date(r.at).toLocaleDateString()}</small></div><span>{r.grade}</span></div>; })}</section></div>;
}
