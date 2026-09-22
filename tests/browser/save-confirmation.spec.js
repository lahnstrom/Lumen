import { test, expect } from '@playwright/test';
test('confirmed card creation stays saved when the following workspace read fails', async ({ page, request }) => {
  const topic = await (await request.post('/api/topics', { data: { title: 'Save confirmation' } })).json();
  let failReads = false;
  await page.route('**/api/state', route => failReads ? route.fulfill({ status: 503, json: { error: 'Temporary refresh failure' } }) : route.continue());
  await page.route(`**/api/topics/${topic.id}/cards`, async route => {
    const response = await route.fetch(); failReads = true; await route.fulfill({ response });
  });
  await page.goto('/'); await page.getByRole('navigation').getByRole('button', { name: 'Save confirmation', exact: true }).click();
  await page.getByRole('button', { name: 'Flashcards', exact: true }).click();
  await page.getByRole('button', { name: 'Add card', exact: true }).click();
  await page.getByLabel('Question', { exact: true }).fill('A confirmed question');
  await page.getByLabel('Answer', { exact: true }).fill('A confirmed answer');
  await page.getByRole('button', { name: 'Save flashcard', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'A confirmed question' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Workspace connection' })).toContainText('Your change was saved.');
  const saved = (await (await request.get('/api/state')).json()).topics.find(t => t.id === topic.id);
  expect(saved.cards).toHaveLength(1);
  failReads = false; await page.getByRole('button', { name: 'Retry connection' }).click();
  await expect(page.getByRole('status', { name: 'Workspace connection' })).toHaveCount(0);
  await expect(page.locator('.library-card')).toHaveCount(1);
});
test('confirmed review advances its schedule and count even if the workspace refresh fails', async ({ page, request }) => {
  const topic = await (await request.post('/api/topics', { data: { title: 'Review receipt' } })).json();
  await request.post(`/api/topics/${topic.id}/cards`, { data: { front: 'Review once', back: 'Recall once' } });
  let failReads = false;
  await page.route('**/api/state', route => failReads ? route.fulfill({ status: 503, json: { error: 'Temporary refresh failure' } }) : route.continue());
  await page.route(`**/api/topics/${topic.id}/cards/*/review`, async route => {
    const response = await route.fetch(); failReads = true; await route.fulfill({ response });
  });
  await page.goto(`/review/${topic.id}`);
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click();
  await page.getByRole('button', { name: /^Good/ }).click();
  await expect(page.getByText('You completed 1 review.', { exact: true })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Workspace connection' })).toContainText('Your change was saved.');
  const state = await (await request.get('/api/state')).json();
  expect(state.reviews.filter(r => r.topicId === topic.id)).toHaveLength(1);
  expect(state.topics.find(t => t.id === topic.id).cards[0].reviews).toBe(1);
  failReads = false; await page.getByRole('button', { name: 'Retry connection' }).click();
  await expect(page.getByRole('status', { name: 'Workspace connection' })).toHaveCount(0);
  await expect(page.getByText('You completed 1 review.', { exact: true })).toBeVisible();
});
test('a delayed old workspace read cannot overwrite a subsequently confirmed save', async ({ page, request }) => {
  const topic = await (await request.post('/api/topics', { data: { title: 'Delayed workspace read' } })).json();
  const oldState = await (await request.get('/api/state')).json();
  let first = true, release;
  const delayed = new Promise(resolve => { release = resolve; });
  await page.route('**/api/state', async route => {
    if (!first) return route.continue();
    first = false; await delayed; await route.fulfill({ json: oldState });
  });
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'Delayed workspace read', exact: true }).click();
  await page.getByRole('button', { name: 'Rename topic', exact: true }).click();
  await page.getByLabel('Topic name', { exact: true }).fill('Confirmed newer name');
  await page.getByRole('button', { name: 'Let’s begin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Confirmed newer name' })).toBeVisible();
  const oldResponse = page.waitForResponse(response => response.url().endsWith('/api/state'));
  release(); await oldResponse;
  // Opening a new view after the old read settles still uses the acknowledged topic.
  await page.getByRole('button', { name: 'Flashcards', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Confirmed newer name' })).toBeVisible();
  expect((await (await request.get('/api/state')).json()).topics.find(t => t.id === topic.id).title).toBe('Confirmed newer name');
});
