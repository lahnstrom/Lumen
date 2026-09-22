import { createEmptyCard, fsrs, generatorParameters, Rating, State } from 'ts-fsrs';

export const SCHEDULER_VERSION = 'fsrs-6-v1';
export const PARAMETERS = generatorParameters({
  request_retention: 0.9,
  maximum_interval: 36500,
  enable_fuzz: true,
  enable_short_term: true,
  learning_steps: ['1m', '10m'],
  relearning_steps: ['10m'],
});
export const scheduler = fsrs(PARAMETERS);
export const RATINGS = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy };
const json = value => JSON.parse(JSON.stringify(value));

export function newSchedule(now = new Date()) {
  return { fsrs: json(createEmptyCard(now)), schedulerVersion: SCHEDULER_VERSION, due: new Date(now).toISOString(), interval: 0, reviews: 0 };
}
export function scheduleResult(card, result, grade) {
  return { ...card, fsrs: json(result.card), schedulerVersion: SCHEDULER_VERSION,
    due: result.card.due.toISOString(), interval: result.card.scheduled_days,
    reviews: (card.reviews || 0) + 1, lastGrade: grade };
}
export function reviewOptions(card, now = new Date()) {
  if (!card.fsrs) throw new Error('Card must be migrated before review.');
  const outcomes = scheduler.repeat(card.fsrs, now);
  return Object.fromEntries(Object.entries(RATINGS).map(([grade, rating]) => [grade, outcomes[rating]]));
}
export function intervalLabel(due, now) {
  const minutes = Math.max(1, Math.round((new Date(due) - new Date(now)) / 60000));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} hr`;
  return `${Math.round(minutes / 1440)}d`;
}
// Reconstruct memory estimates from actual recorded answers, without moving due dates.
export function migrateWorkspace(db, now = new Date()) {
  let changed = false;
  for (const topic of db.topics) for (const card of topic.cards) {
    if (card.fsrs) continue;
    const history = db.reviews.filter(r => r.topicId === topic.id && r.cardId === card.id && RATINGS[r.grade] && Number.isFinite(Date.parse(r.at)))
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    let memory = createEmptyCard(history[0]?.at || card.due || now);
    for (const review of history) memory = scheduler.next(memory, new Date(review.at), RATINGS[review.grade]).card;
    // A legacy card without review history has no defensible memory estimate: start New.
    card.fsrs = json({ ...memory, due: new Date(card.due || now) });
    card.schedulerVersion = SCHEDULER_VERSION;
    card.migration = { at: new Date(now).toISOString(), replayedReviews: history.length, priorInterval: card.interval || 0, historyMissing: (card.reviews || 0) > history.length };
    card.due ||= new Date(now).toISOString();
    changed = true;
  }
  if (!db.scheduler) { db.scheduler = { version: SCHEDULER_VERSION, parameters: PARAMETERS }; changed = true; }
  return changed;
}
export { State };
