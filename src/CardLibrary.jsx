import React, { useEffect, useState } from 'react';
import { ArrowUpRight, Download, Eye, EyeOff, Layers, Pencil, Plus, Search, Sparkles, X } from 'lucide-react';
import { AnkiPanel } from './Anki.jsx';
import { CardFace } from './Studio.jsx';
import { isDue, dueLabel, isPaused, selectCards } from './study.js';

function LibraryCard({ card, now, edit }) {
  const [answer, setAnswer] = useState(false);
  useEffect(() => setAnswer(false), [card.front, card.back, card.cloze?.text]);
  return <article className={'study-card library-card ' + (isPaused(card) ? 'paused-card' : '')}>
    <div className="card-top"><span>{card.reviews ? `${card.reviews} reviews` : 'NEW CARD'}</span><button aria-label="Edit card" title={card.studio ? 'Edit in Studio' : 'Edit card'} onClick={() => edit(card)}><Pencil size={15}/></button></div>
    {card.kind ? <CardFace card={card} answer={answer}/> : <><h3>{card.front}</h3>{answer && <p className="library-answer">{card.back}</p>}</>}
    <button className="text-button library-reveal" aria-expanded={answer} onClick={() => setAnswer(!answer)}>{answer ? <EyeOff size={14}/> : <Eye size={14}/>} {answer ? 'Hide answer' : 'Show answer'}</button>
    {card.anki?.cardId && <p className="library-anki-note">Local draft · Live Anki content is shown during review.</p>}
    {card.studio && <button className="text-button" onClick={() => edit(card)}>Edit & export in Studio <ArrowUpRight size={13}/></button>}
    <div className="card-source">{card.source || 'Personal card · no source attached'}</div>
    <div className="card-due"><span>{dueLabel(card, now)}</span>{card.anki?.cardId && <span className="anki-card-badge">Anki</span>}</div>
  </article>;
}

export function CardLibrary({ topic, anki, now, api, refresh, add, edit, review }) {
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all'), [sort, setSort] = useState('ready'), [limit, setLimit] = useState(24);
  useEffect(() => setLimit(24), [query, filter, sort]);
  const due = topic.cards.filter(c => isDue(c, now));
  const visible = selectCards(topic.cards, { query, filter, sort, now });
  const filters = [['all', 'All cards'], ['ready', 'Ready'], ['new', 'New'], ['practised', 'Practised'], ['paused', 'Paused'], ['unavailable', 'Unavailable']];
  return <section className="panel" aria-label="Flashcard library">
    <div className="section-title"><div><h2>A little recall, a lasting memory</h2><p>{topic.cards.filter(c => !isPaused(c)).length} active cards in this topic · {due.length} ready to review</p></div><div className="actions"><button className="button secondary" onClick={add}><Plus size={16}/>Add card</button>{topic.cards.some(c => !c.suspended && !c.studio) && <a className="button secondary" href={`/api/topics/${topic.id}/export`}><Download size={16}/>{topic.cards.some(c => c.studio && !c.suspended) ? 'Basic cards TSV' : 'Anki'}</a>}<button className="button" disabled={!due.length} onClick={review}>Review {due.length || ''}<ArrowUpRight size={16}/></button></div></div>
    <AnkiPanel topic={topic} status={anki} api={api} refresh={refresh}/>
    {!topic.cards.length ? <div className="library-empty"><Layers size={34}/><h3>Turn understanding into recall</h3><p>Ask Lumen for flashcards in your conversation, build a learning kit, or add a card yourself.</p><button className="button secondary" onClick={add}><Plus size={15}/>Add your first card</button></div> : <>
      <div className="note-banner"><Sparkles size={16}/>{topic.anki?.enabled ? 'Linked cards use Anki’s scheduler and deck settings. Reviews from Anki appear automatically. Keep desktop Anki open.' : 'FSRS spaced repetition · 90% target retention · Learning: 1 min, 10 min · Relearning: 10 min. Review generated cards before studying.'}</div>
      <div className="library-tools"><label className="library-search"><Search size={16}/><input aria-label="Search flashcards" placeholder="Search questions, answers, or sources…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button aria-label="Clear flashcard search" onClick={() => setQuery('')}><X size={15}/></button>}</label><label className="library-sort">Sort<select aria-label="Sort flashcards" value={sort} onChange={e => setSort(e.target.value)}><option value="ready">Ready first</option><option value="practised">Most practised</option><option value="alphabetical">Alphabetical</option></select></label></div>
      <div className="library-filters" role="group" aria-label="Filter flashcards">{filters.map(([value, label]) => { const count = selectCards(topic.cards, { filter: value, now }).length; if (value === 'unavailable' && !count && filter !== value) return null; return <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}<span>{count}</span></button>; })}</div>
      <div className="library-result-count" role="status">{visible.length} {visible.length === 1 ? 'card' : 'cards'}{query ? ' matching your search' : filter !== 'all' ? ` in ${filters.find(([v]) => v === filter)[1].toLowerCase()}` : ' in this space'}<span>Browsing does not record a review.</span></div>
      {visible.length ? <><div className="card-grid">{visible.slice(0, limit).map(card => <LibraryCard key={card.id} card={card} now={now} edit={edit}/>)}</div>{visible.length > limit && <button className="button secondary library-more" onClick={() => setLimit(n => n + 24)}>Show more cards ({visible.length - limit} remaining)</button>}</> : <div className="library-empty"><Search size={30}/><h3>{query ? 'No matching cards' : 'No cards in this view'}</h3><p>{query ? 'Try a different phrase, source title, or filter.' : 'Your cards move between these views as you study.'}</p><button className="button secondary" onClick={() => { setQuery(''); setFilter('all'); }}>Show all cards</button></div>}
    </>}
  </section>;
}
