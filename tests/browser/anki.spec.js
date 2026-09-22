import { test, expect } from '@playwright/test';

test('linked review renders Anki content safely and reflects externally updated history', async ({ page }) => {
  const card = { id: 'card', front: 'Local question', back: 'Local answer', source: '', reviews: 4, due: new Date().toISOString(), anki: { cardId: 101, dueNow: true, interval: 3, question: 'Anki question <script>parent.hacked = true</script>', answer: 'Anki answer', css: '', reps: 2 } };
  const topic = { id: 'anki-topic', title: 'Anki learning', cards: [card], sources: [], messages: [], graph: { nodes: [], edges: [] }, anki: { enabled: true, deck: 'Learning' } };
  const state = { topics: [topic], reviews: [], jobs: [], anki: { enabled: true, connected: true, lastPullAt: new Date().toISOString() } };
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.route('**/api/topics/anki-topic/cards/card/preview', route => route.fulfill({ json: { token: 'test-token', scheduler: 'anki', options: Object.fromEntries(['again', 'hard', 'good', 'easy'].map(g => [g, { label: '3d' }])) } }));
  await page.route('**/api/topics/anki-topic/cards/card/review', route => { expect(route.request().postDataJSON()).toEqual({ grade: 'good', token: 'test-token' }); card.reviews++; card.anki.dueNow = false; state.reviews.push({ id: 'external', topicId: topic.id, cardId: card.id, scheduler: 'anki', grade: 'good', at: new Date().toISOString() }); return route.fulfill({ json: { saved: true } }); });
  await page.goto('/review/anki-topic');
  await expect(page.getByText('Connected to Anki · Reviews sync automatically')).toBeVisible();
  await expect(page.frameLocator('iframe[title="Anki question"]').getByText('Anki question', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.hacked)).toBeUndefined();
  await page.getByRole('button', { name: 'Reveal answer' }).click();
  await expect(page.frameLocator('iframe[title="Anki answer"]').getByText('Anki answer')).toBeVisible();
  await page.getByRole('button', { name: 'Good 3d' }).click();
  await expect(page.getByRole('heading', { name: 'A little stronger than before.' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to flashcards' }).click();
  await expect(page.getByText('5 reviews', { exact: true })).toBeVisible();
  await expect(page.getByText('Scheduled in Anki · 3 day interval')).toBeVisible();
});

test('Anki setup shows connection problems and explains the scheduler handover', async ({ page, request }) => {
  const topic = await (await request.post('/api/topics', { data: { title: 'Connect test' } })).json();
  await page.route('**/api/anki/connection', route => route.fulfill({ json: { profile: 'Test profile', decks: ['Existing deck'] } }));
  await page.goto('/'); await page.getByRole('navigation').getByRole('button', { name: 'Connect test', exact: true }).click(); await page.getByRole('button', { name: 'Flashcards', exact: true }).click();
  await page.getByRole('button', { name: 'Connect Anki', exact: true }).click();
  await expect(page.getByLabel('Anki deck', { exact: true })).toHaveValue('Lumen::Connect test');
  await expect(page.getByText(/New notes start with Anki’s schedule/)).toBeVisible();
  await page.route(`**/api/topics/${topic.id}/anki`, route => route.fulfill({ status: 400, json: { error: 'Open the linked Anki profile before synchronizing.' } }));
  await page.getByRole('button', { name: 'Connect & sync' }).click();
  await expect(page.getByRole('alert')).toContainText('Open the linked Anki profile');
});
