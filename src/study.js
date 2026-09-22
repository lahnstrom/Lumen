export const isPaused = card => !!card.suspended || (card.anki?.queue ?? 0) < 0;
export function isDue(card, now = Date.now()) {
  if (isPaused(card)) return false;
  if (card.anki?.cardId || card.anki?.missing || card.anki?.error) return !!card.anki.dueNow && !card.anki.missing && !card.anki.error;
  return new Date(card.due) <= now;
}
export function dueLabel(card, now = Date.now()) {
  if (card.suspended) return 'Paused in Lumen';
  if (card.anki?.error) return 'Anki needs attention';
  if (card.anki?.missing) return 'Missing in Anki';
  if (card.anki?.queue === -1) return 'Suspended in Anki';
  if (card.anki?.queue < -1) return 'Buried in Anki';
  if (isDue(card, now)) return 'Ready to review';
  if (card.anki?.cardId) return `Scheduled in Anki · ${card.anki.interval || 0} day interval`;
  return `Due ${new Date(card.due).toLocaleDateString()}`;
}

export function selectCards(cards, { query = '', filter = 'all', sort = 'ready', now = Date.now() } = {}) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const result = cards.filter(card => {
    const unavailable = !!(card.anki?.missing || card.anki?.error);
    if (filter === 'ready' && !isDue(card, now)) return false;
    if (filter === 'new' && (card.reviews > 0 || isPaused(card) || unavailable)) return false;
    if (filter === 'practised' && !(card.reviews > 0)) return false;
    if (filter === 'paused' && !isPaused(card)) return false;
    if (filter === 'unavailable' && !unavailable) return false;
    const text = [card.front, card.back, card.source, card.cloze?.text, card.occlusion?.caption].filter(Boolean).join(' ').toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
  return result.sort((a, b) => sort === 'alphabetical' ? a.front.localeCompare(b.front) : sort === 'practised' ? (b.reviews || 0) - (a.reviews || 0) : Number(isDue(b, now)) - Number(isDue(a, now)));
}
