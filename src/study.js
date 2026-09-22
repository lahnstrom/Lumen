export function isDue(card, now = Date.now()) {
  if (card.suspended) return false;
  if (card.anki?.cardId || card.anki?.missing || card.anki?.error) return !!card.anki.dueNow && !card.anki.missing && !card.anki.error;
  return new Date(card.due) <= now;
}
export function dueLabel(card, now = Date.now()) {
  if (card.anki?.missing) return 'Missing in Anki';
  if (card.anki?.queue === -1) return 'Suspended in Anki';
  if (card.anki?.queue < -1) return 'Buried in Anki';
  if (isDue(card, now)) return 'Ready to review';
  if (card.anki?.cardId) return `Scheduled in Anki · ${card.anki.interval || 0} day interval`;
  return `Due ${new Date(card.due).toLocaleDateString()}`;
}
