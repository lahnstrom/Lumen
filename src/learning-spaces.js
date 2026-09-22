import { isDue, isPaused } from './study.js';
export function learningSpaces(topics, reviews, { query = '', filter = 'all', sort = 'ready', now = Date.now() } = {}) {
  const lastReview = new Map();
  for (const review of reviews) {
    const at = new Date(review.at).getTime();
    if (Number.isFinite(at)) lastReview.set(review.topicId, Math.max(lastReview.get(review.topicId) || 0, at));
  }
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return topics.map(topic => {
    const available = topic.cards.filter(c => !isPaused(c) && !c.anki?.missing && !c.anki?.error);
    const active = available.length, ready = available.filter(c => isDue(c, now)).length;
    const practised = available.filter(c => c.reviews > 0).length;
    const unavailable = topic.cards.filter(c => c.anki?.missing || c.anki?.error).length;
    const paused = topic.cards.filter(isPaused).length;
    const nextDue = available.filter(c => !c.anki?.cardId && !isDue(c, now)).map(c => new Date(c.due).getTime()).filter(Number.isFinite).sort((a, b) => a - b)[0] || null;
    return { topic, active, ready, practised, unavailable, paused, nextDue, lastReview: lastReview.get(topic.id) || 0 };
  }).filter(space => terms.every(term => space.topic.title.toLocaleLowerCase().includes(term)) && (filter !== 'ready' || space.ready > 0) && (filter !== 'unpractised' || space.active > space.practised))
    .sort((a, b) => sort === 'alphabetical' ? a.topic.title.localeCompare(b.topic.title) : sort === 'recent' ? b.lastReview - a.lastReview : b.ready - a.ready || b.lastReview - a.lastReview);
}
