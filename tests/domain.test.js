import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newTopic, ankiExport, applyBundle } from '../server/domain.js';
test('Anki export escapes markup and keeps each card on one TSV row', () => {
  const t = newTopic('Renal physiology'); t.cards.push({ front: 'A\tB\n<question>', back: 'A & B', source: 'Source\npage 2' });
  const output = ankiExport(t); assert.match(output, /A B<br>&lt;question&gt;\tA &amp; B/);
  assert.equal(output.split('\n').length, 5); assert.equal(output.split('\n')[4].split('\t').length, 3);
});
test('learning bundle excludes unsafe source links, dangling edges, and duplicate cards', () => {
  const t = newTopic('Test'); const b = { reply: 'Ready', sources: [{ title: 'Bad', url: 'javascript:alert(1)' }, { title: 'Good', url: 'https://example.org' }], nodes: [{ id: 'a', label: 'A' }], edges: [{ from: 'a', to: 'missing' }], cards: [{ front: 'Question?', back: 'Answer', source: 'Notes' }] };
  applyBundle(t, b, 'build'); applyBundle(t, b, 'build'); assert.equal(t.sources.length, 1); assert.equal(t.cards.length, 1); assert.equal(t.graph.edges.length, 0);
});
