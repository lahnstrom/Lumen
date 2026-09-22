import { test } from 'node:test';
import assert from 'node:assert/strict';
import { studioCards, importStudioCards } from '../server/studio-cards.js';
import { newTopic } from '../server/domain.js';
import { reviewOptions, scheduleResult } from '../server/scheduler.js';
const project = { id: 'a'.repeat(32), title: 'Water', text: 'Source notes', source: 'Notes', clozes: [{ id: 'b'.repeat(32), enabled: true, text: '{{c1::Water::substance}} changes by {{c2::evaporation}}.', extra: 'Context', evidence: 'Notes' }], images: [{ id: 'c'.repeat(32), enabled: true, width: 200, height: 100, mode: 'ao', caption: 'Diagram', regions: [{ id: 'd'.repeat(32), x: 0, y: 0, width: .2, height: .3, label: 'Label' }] }] };
test('each cloze number and mask becomes a separate review card', () => {
  const cards = studioCards(project); assert.equal(cards.length, 3);
  assert.equal(cards[0].front, '[substance] changes by evaporation.');
  assert.equal(cards[1].front, 'Water changes by […].');
  assert.equal(cards[2].kind, 'occlusion'); assert.equal(cards[2].occlusion.regions.length, 1);
});
test('reimport updates content and preserves reviews; removed cards suspend and can return', () => {
  const t = newTopic('Water'); importStudioCards(t, project);
  const initialId = t.cards[0].id; const now = new Date();
  t.cards[0] = scheduleResult(t.cards[0], reviewOptions(t.cards[0], now).good, 'good');
  const schedule = JSON.stringify(t.cards[0].fsrs);
  const edited = structuredClone(project); edited.clozes[0].text = '{{c1::Water}} is a liquid.';
  const result = importStudioCards(t, edited);
  assert.equal(result.added, 0); assert.equal(t.cards[0].id, initialId); assert.equal(JSON.stringify(t.cards[0].fsrs), schedule);
  assert.equal(t.cards[1].suspended, true); assert.equal(t.cards[0].front, '[…] is a liquid.');
  importStudioCards(t, project); assert.equal(t.cards[1].suspended, false); assert.equal(t.cards.length, 3); assert.equal(t.sources.length, 1);
});
test('disabled drafts and images are excluded', () => {
  const p = structuredClone(project); p.clozes[0].enabled = false; p.images[0].enabled = false;
  assert.equal(studioCards(p).length, 0);
});
test('unchecking every draft suspends previously imported cards without erasing history', () => {
  const t = newTopic('Water'); importStudioCards(t, project);
  const disabled = structuredClone(project); disabled.clozes[0].enabled = false; disabled.images[0].enabled = false;
  importStudioCards(t, disabled); assert.equal(t.cards.length, 3); assert.ok(t.cards.every(c => c.suspended));
});
