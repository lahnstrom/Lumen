import test from 'node:test';
import assert from 'node:assert/strict';
import { AnkiBridge } from '../server/anki.js';
import { newSchedule } from '../server/scheduler.js';

function fixture() {
  const card = { id: 'card-one', front: 'Question', back: 'Answer', source: 'Notes', ...newSchedule(), reviews: 2 };
  const topic = { id: 'topic', title: 'Space', cards: [card], anki: { enabled: true, deck: 'Lumen' } };
  const db = { topics: [topic], reviews: [{ id: 'local', cardId: card.id, topicId: topic.id, grade: 'good', at: new Date().toISOString() }], anki: { enabled: true, profile: 'User' } };
  const info = { cardId: 101, note: 201, ord: 0, reps: 0, lapses: 0, due: 0, queue: 0, type: 0, interval: 0, mod: 1, fields: { Front: { value: 'Question' }, Back: { value: 'Answer' }, Source: { value: 'Notes' }, LumenID: { value: 'card-one' } }, question: 'Question', answer: 'Answer', css: '', nextReviews: ['1m', '6m', '10m', '4d'], deckName: 'Lumen' };
  const state = { profile: 'User', history: [], due: true, exists: false, adds: 0, answers: 0, saves: 0, failAnswer: false, failCloud: false, edited: 0, missing: false };
  const invoke = async (action, params = {}) => {
    if (action === 'getActiveProfile') return state.profile;
    if (action === 'deckNames') return ['Lumen'];
    if (action === 'apiReflect') return { actions: ['answerCards', 'cardsInfo', 'getReviewsOfCards'] };
    if (action === 'modelNames') return ['Lumen Basic v1'];
    if (action === 'modelFieldNames') return ['Front', 'Back', 'Source', 'LumenID'];
    if (action === 'createDeck') return 1;
    if (action === 'findNotes') return state.exists && !state.missing ? [201] : [];
    if (action === 'addNote') { state.exists = true; state.adds++; return 201; }
    if (action === 'notesInfo') return [{ cards: [101] }];
    if (action === 'cardsInfo') return [state.missing ? {} : structuredClone(info)];
    if (action === 'findCards') return state.due ? [101] : [];
    if (action === 'getReviewsOfCards') return { 101: structuredClone(state.history) };
    if (action === 'updateNoteFields') { state.edited++; info.fields = Object.fromEntries(Object.entries(params.note.fields).map(([k, v]) => [k, { value: v }])); return null; }
    if (action === 'sync') { if (state.failCloud) throw new Error('auth not configured'); return null; }
    if (action === 'answerCards') {
      state.answers++; info.reps++; info.interval = 4; info.mod++; info.queue = 2; state.due = false;
      state.history.push({ id: Date.now(), ease: params.answers[0].ease, ivl: 4, type: 1 });
      if (state.failAnswer) throw new Error('Lost reply after saving'); return [true];
    }
    throw new Error('Unexpected action: ' + action);
  };
  const bridge = new AnkiBridge({ db, invoke, save: () => state.saves++, studioBundle: async () => ({ notes: [], media: [] }) });
  return { card, topic, db, info, state, bridge };
}

test('publishing is idempotent, preserves Lumen history, and adopts existing Anki notes', async () => {
  const f = fixture(); await f.bridge.sync(); await f.bridge.sync();
  assert.equal(f.state.adds, 1); assert.equal(f.card.anki.cardId, 101); assert.equal(f.card.reviews, 2); assert.equal(f.db.reviews[0].id, 'local');
  const adopted = fixture(); adopted.state.exists = true; adopted.info.reps = 5; await adopted.bridge.sync(); assert.equal(adopted.state.adds, 0); assert.equal(adopted.card.reviews, 7);
});
test('imports external reviews once, mirrors undo, and handles suspension and deletion', async () => {
  const f = fixture(); await f.bridge.sync();
  f.state.history.push({ id: Date.now(), ease: 3, ivl: 7 }); f.info.reps = 1; f.info.interval = 7; f.state.due = false;
  await f.bridge.sync(); await f.bridge.sync(); assert.equal(f.db.reviews.length, 2); assert.equal(f.card.reviews, 3); assert.equal(f.card.anki.dueNow, false);
  f.state.history = []; f.info.reps = 0; f.info.queue = -1; await f.bridge.sync(); assert.equal(f.db.reviews.length, 1); assert.equal(f.card.reviews, 2); assert.equal(f.card.anki.queue, -1);
  f.state.missing = true; await f.bridge.sync(); await f.bridge.sync(); assert.equal(f.state.adds, 1); assert.equal(f.card.anki.missing, true);
});
test('Anki owns intervals and answers; duplicate submissions and changed cards are rejected', async () => {
  const f = fixture(); await f.bridge.sync(); const preview = await f.bridge.preview(f.card); assert.equal(preview.options.easy.label, '4d');
  await f.bridge.answer(f.card, 'easy', preview.token); await assert.rejects(f.bridge.answer(f.card, 'easy', preview.token), /already been submitted/); assert.equal(f.state.answers, 1); assert.equal(f.card.interval, 4);
  await f.bridge.tail;
  f.state.due = true; const another = await f.bridge.preview(f.card); f.info.mod++;
  await assert.rejects(f.bridge.answer(f.card, 'again', another.token), /changed in Anki/); assert.equal(f.state.answers, 1);
});
test('an ambiguous answer is reconciled without retrying and cloud errors do not lose the review', async () => {
  const f = fixture(); await f.bridge.sync(); const preview = await f.bridge.preview(f.card); f.state.failAnswer = true; f.state.failCloud = true;
  await f.bridge.answer(f.card, 'good', preview.token); await f.bridge.tail;
  assert.equal(f.state.answers, 1); assert.equal(f.db.reviews.length, 2); assert.equal(f.db.anki.pending, undefined); assert.match(f.db.anki.webError, /auth not configured/);
});
test('wrong profiles are refused before writes and local/remote content conflicts preserve Anki', async () => {
  const f = fixture(); f.state.profile = 'Other'; await assert.rejects(f.bridge.sync(), /linked Anki profile/); assert.equal(f.state.adds, 0);
  f.state.profile = 'User'; await f.bridge.sync(); f.card.front = 'Local change'; await f.bridge.sync(); assert.equal(f.state.edited, 1);
  f.card.front = 'Second local change'; f.info.fields.Front.value = 'Remote change'; await f.bridge.sync(); assert.equal(f.state.edited, 1); assert.equal(f.card.anki.contentConflict, true); assert.equal(f.info.fields.Front.value, 'Remote change');
  await f.bridge.sync(); await f.bridge.sync(); assert.equal(f.state.edited, 1); assert.equal(f.info.fields.Front.value, 'Remote change');
  await f.bridge.keepAnkiContent(f.topic); await f.bridge.sync(); assert.equal(f.card.anki.contentConflict, false); assert.equal(f.state.edited, 1);
});
test('duplicate stable identities are not guessed or overwritten', async () => {
  const f = fixture(); const original = f.bridge.invoke; f.bridge.invoke = async (a, p) => a === 'findNotes' ? [201, 202] : original(a, p);
  await f.bridge.sync(); assert.equal(f.state.adds, 0); assert.match(f.card.anki.error, /Multiple Anki notes/);
});


test('publication failures do not prevent importing reviews for already linked cards', async () => {
  const f = fixture(); await f.bridge.sync(); f.state.history.push({ id: Date.now(), ease: 3, ivl: 4 }); f.info.reps = 1;
  f.card.front = 'New local draft'; const invoke = f.bridge.invoke;
  f.bridge.invoke = async (action, p) => { if (action === 'updateNoteFields') throw new Error('Note locked'); return invoke(action, p); };
  await f.bridge.sync(); assert.equal(f.db.reviews.length, 2); assert.equal(f.card.reviews, 3); assert.equal(f.db.anki.connected, true); assert.equal(f.topic.anki.error, 'Note locked');
  f.bridge.invoke = invoke; await f.bridge.sync(); assert.equal(f.topic.anki.error, ''); assert.equal(f.info.fields.Front.value, 'New local draft');
});
