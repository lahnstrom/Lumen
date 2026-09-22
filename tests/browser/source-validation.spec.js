import { test, expect } from '@playwright/test';

test('malformed source metadata is rejected before it can corrupt a learning space', async ({ request }) => {
  const t = await (await request.post('/api/topics', { data: { title: 'Source validation' } })).json();
  for (const url of ['https://', 'https://exa mple.org', { url: 'https://example.org' }]) expect((await request.post(`/api/topics/${t.id}/sources`, { data: { title: 'Malformed', url } })).status()).toBe(400);
  expect((await request.post(`/api/topics/${t.id}/cards`, { data: { front: 'Question', back: 'Answer', source: {} } })).status()).toBe(400);
  const topic = await (await request.post(`/api/topics/${t.id}/cards`, { data: { front: 'Question', back: 'Answer', source: 'Notes' } })).json();
  expect((await request.patch(`/api/topics/${t.id}/cards/${topic.cards[0].id}`, { data: { source: {} } })).status()).toBe(400);
  expect((await request.put(`/api/topics/${t.id}/graph`, { data: { nodes: [{ id: 'a', label: 'A' }], edges: [{ from: 'a', to: 'a', label: 'relates to', source: {} }] } })).status()).toBe(400);
  const saved = (await (await request.get('/api/state')).json()).topics.find(x => x.id === t.id);
  expect(saved.sources).toEqual([]); expect(saved.cards[0].source).toBe('Notes'); expect(saved.graph.nodes).toEqual([]);
});

test('an old malformed saved URL remains readable without crashing the Sources page', async ({ page }) => {
  const topic = { id: 'old-source', title: 'Older references', cards: [], messages: [], graph: { nodes: [], edges: [] }, sources: [{ id: 'bad', title: 'Old broken reference', kind: 'link', url: 'https://', note: 'Retained notes for recovery' }] };
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/state', route => route.fulfill({ json: { topics: [topic], reviews: [], jobs: [] } }));
  await page.goto('/'); await page.getByRole('navigation').getByRole('button', { name: 'Older references', exact: true }).click(); await page.getByRole('button', { name: 'Sources', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Old broken reference' })).toBeVisible();
  await expect(page.getByText('Invalid saved link', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Old broken reference' })).toHaveCount(0);
  await expect(page.getByText('Retained notes for recovery')).toBeVisible(); expect(errors).toEqual([]);
});
