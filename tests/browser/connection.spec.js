import { test, expect } from '@playwright/test';

test('offline workspace shows stale state and reconnects without losing the draft', async ({ page, request, context }) => {
  const topic = await (await request.post('/api/topics', { data: { title: 'Reconnect study' } })).json();
  await page.route('**/api/account', route => route.fulfill({ json: { connected: true } }));
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'Reconnect study', exact: true }).click();
  await page.getByLabel('Message Lumen').fill('Keep this question while the network changes.');
  await expect(page.getByText('Connected to workspace', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByRole('status', { name: 'Workspace connection' })).toContainText('This device is offline');
  await expect(page.getByRole('button', { name: 'Retry connection' })).toBeDisabled();
  // Another client updates the host while this browser is disconnected.
  await request.patch(`/api/topics/${topic.id}`, { data: { title: 'Reconnect study updated elsewhere' } });
  await context.setOffline(false);
  await expect(page.getByRole('status', { name: 'Workspace connection' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Reconnect study updated elsewhere' })).toBeVisible();
  await expect(page.getByLabel('Message Lumen')).toHaveValue('Keep this question while the network changes.');
});

test('a failed workspace refresh is visible and a manual retry reloads data in place', async ({ page }) => {
  let failing = true;
  await page.route('**/api/state', route => failing ? route.fulfill({ status: 503, json: { error: 'Home workspace temporarily unavailable.' } }) : route.continue());
  await page.goto('/');
  const notice = page.getByRole('status', { name: 'Workspace connection' });
  await expect(notice).toContainText('Workspace refresh interrupted');
  await expect(notice).toContainText('Home workspace temporarily unavailable.');
  failing = false;
  await page.getByRole('button', { name: 'Retry connection' }).click();
  await expect(notice).toHaveCount(0);
  await expect(page.getByText('Connected to workspace', { exact: true })).toBeVisible();
});

test('phone review shows an offline notice and recovers without leaving the page', async ({ page, request, context }) => {
  const topic = await (await request.post('/api/topics', { data: { title: 'Review connection' } })).json();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/review/${topic.id}`);
  await expect(page.getByRole('heading', { name: 'Review connection', exact: true })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByRole('status', { name: 'Workspace connection' })).toContainText('This device is offline');
  await context.setOffline(false);
  await expect(page.getByRole('status', { name: 'Workspace connection' })).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/review/${topic.id}$`));
});
