import { test, expect } from '@playwright/test';

test('search and progress filters expose the collection without revealing answers or recording reviews', async ({ page }) => {
  const topic = { id: 'library', title: 'Card library', sources: [], messages: [], graph: { nodes: [], edges: [] }, cards: [
    { id: 'one', front: 'What does Doppler measure?', back: 'Frequency shifts from motion.', source: 'Ultrasound notes', reviews: 0, due: '2020-01-01' },
    { id: 'two', front: 'What is output?', back: 'Volume per minute.', source: 'Physiology', reviews: 4, due: '2099-01-01' },
    { id: 'three', front: 'A paused card', back: 'Retained for later.', source: '', reviews: 2, due: '2020-01-01', suspended: true },
    { id: 'four', front: 'Anki card', back: 'A linked answer.', source: '', reviews: 0, anki: { cardId: 123, dueNow: true, queue: -1 } },
  ] };
  await page.route('**/api/state', route => route.fulfill({ json: { topics: [topic], reviews: [], jobs: [], anki: { enabled: false } } }));
  const reviewCalls = []; page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/review')) reviewCalls.push(r.url()); });
  await page.goto('/'); await page.getByRole('navigation').getByRole('button', { name: 'Card library', exact: true }).click(); await page.getByRole('button', { name: 'Flashcards', exact: true }).click();
  await expect(page.locator('.library-card')).toHaveCount(4);
  await expect(page.getByText('Frequency shifts from motion.', { exact: true })).toHaveCount(0);
  await page.getByLabel('Search flashcards').fill('frequency notes');
  await expect(page.locator('.library-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Show answer', exact: true }).click();
  await expect(page.getByText('Frequency shifts from motion.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear flashcard search' }).click();
  const filters = page.getByRole('group', { name: 'Filter flashcards' });
  await filters.getByRole('button', { name: /^Ready/ }).click(); await expect(page.locator('.library-card')).toHaveCount(1);
  await filters.getByRole('button', { name: /^Paused/ }).click(); await expect(page.locator('.library-card')).toHaveCount(2);
  await expect(page.getByText('Paused in Lumen', { exact: true })).toBeVisible(); await expect(page.getByText('Suspended in Anki', { exact: true })).toBeVisible();
  await filters.getByRole('button', { name: /^Practised/ }).click(); await page.getByLabel('Sort flashcards').selectOption('practised');
  await expect(page.locator('.library-card').first().getByRole('heading')).toHaveText('What is output?');
  await page.getByLabel('Search flashcards').fill('unmatched'); await expect(page.getByRole('heading', { name: 'No matching cards' })).toBeVisible();
  await page.getByRole('button', { name: 'Show all cards' }).click(); await expect(page.locator('.library-card')).toHaveCount(4);
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect(reviewCalls).toEqual([]);
});

test('grading shortcuts work after clicking reveal and do not double-submit', async ({ page, request }) => {
  const topic = await (await request.post('/api/topics', { data: { title: 'Keyboard recall' } })).json();
  await request.post(`/api/topics/${topic.id}/cards`, { data: { front: 'A keyboard question', back: 'A keyboard answer' } });
  await page.goto(`/review/${topic.id}`);
  await page.getByRole('button', { name: 'Reveal answer' }).click();
  await expect(page.getByRole('button', { name: 'Good 10 min' })).toBeVisible();
  await page.getByRole('button', { name: 'Good 10 min' }).focus();
  await page.keyboard.press('3'); await page.keyboard.press('3');
  await expect(page.getByRole('heading', { name: 'A little stronger than before.' })).toBeVisible();
  const state = await (await request.get('/api/state')).json();
  expect(state.reviews.filter(r => r.topicId === topic.id)).toHaveLength(1);
});
