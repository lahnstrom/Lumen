import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftStore } from '../src/drafts.js';
function storage() { const map = new Map(); return { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }; }

test('drafts stay separate across topics and survive a new application instance', () => {
  const disk = storage(), first = createDraftStore(disk);
  first.write('heart', 'Explain a pressure gradient'); first.write('lung', 'Explain ventilation');
  const reloaded = createDraftStore(disk);
  assert.equal(reloaded.read('heart'), 'Explain a pressure gradient'); assert.equal(reloaded.read('lung'), 'Explain ventilation');
  reloaded.clearIfMatches('heart', 'Explain a pressure gradient');
  assert.equal(createDraftStore(disk).read('heart'), ''); assert.equal(reloaded.read('lung'), 'Explain ventilation');
});
test('an accepted send never clears newer text or another topic', () => {
  const store = createDraftStore(storage()); store.write('a', 'First question'); store.write('b', 'Other topic');
  store.write('a', 'Follow-up in progress'); store.clearIfMatches('a', 'First question');
  assert.equal(store.read('a'), 'Follow-up in progress'); assert.equal(store.read('b'), 'Other topic');
});
test('blocked browser storage retains a usable in-memory draft and reports the limitation', () => {
  const store = createDraftStore({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('blocked'); } });
  assert.equal(store.read('a'), ''); store.write('a', 'Still typing'); assert.equal(store.read('a'), 'Still typing'); assert.equal(store.persistent, false);
  store.clearIfMatches('a', 'Still typing'); assert.equal(store.read('a'), '');
});
