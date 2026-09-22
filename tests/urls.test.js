import test from 'node:test';
import assert from 'node:assert/strict';
import { httpUrl, sourceHostname } from '../shared/urls.js';
import { applyBundle, newTopic } from '../server/domain.js';

test('source URL validation requires a parseable HTTP(S) host without fetching anything', () => {
  for (const invalid of ['https://', 'http://?', 'https://exa mple.org', 'javascript:alert(1)', 'file:///tmp/source', '//example.org', {}, null, '']) assert.equal(httpUrl(invalid), null);
  assert.equal(httpUrl(' HTTPS://example.org/paper?q=1#abstract ').hostname, 'example.org');
  assert.equal(httpUrl('https://å.example.org').protocol, 'https:');
  assert.equal(sourceHostname('https://'), 'Invalid saved link');
});
test('malformed links in generated learning material are omitted without losing valid sources or cards', () => {
  const topic = newTopic('Sources');
  applyBundle(topic, { reply: 'Saved', sources: [{ title: 'Broken', url: 'https://' }, { title: 'Readable', url: 'https://example.org/paper' }], cards: [{ front: 'Question', back: 'Answer', source: 'Notes' }] });
  assert.equal(topic.sources.length, 1); assert.equal(topic.sources[0].title, 'Readable'); assert.equal(topic.cards.length, 1);
});
