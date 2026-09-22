import { test, expect } from '@playwright/test';

test('topic drafts survive navigation, reload, and rejected sends', async ({ page, request }) => {
  for (const title of ['Draft heart', 'Draft lung']) await request.post('/api/topics', { data: { title } });
  await page.route('**/api/account', route => route.fulfill({ json: { connected: true } }));
  await page.route('**/api/topics/*/chat', route => route.fulfill({ status: 400, json: { error: 'Connection interrupted. Try again.' } }));
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'Draft heart', exact: true }).click();
  await page.getByLabel('Message Lumen').fill('Explain the pressure gradient');
  await page.getByRole('navigation').getByRole('button', { name: 'Draft lung', exact: true }).click();
  await expect(page.getByLabel('Message Lumen')).toHaveValue('');
  await page.getByLabel('Message Lumen').fill('Explain ventilation');
  await page.getByRole('navigation').getByRole('button', { name: 'Draft heart', exact: true }).click();
  await expect(page.getByLabel('Message Lumen')).toHaveValue('Explain the pressure gradient');
  await page.reload(); await expect(page.getByLabel('Message Lumen')).toHaveValue('Explain the pressure gradient');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Connection interrupted');
  await expect(page.getByLabel('Message Lumen')).toHaveValue('Explain the pressure gradient');
  await expect(page.getByText(/Draft saved on this device/)).toBeVisible();
});

test('accepted requests clear only their submitted draft and quick prompts leave drafts alone', async ({ page, request }) => {
  await request.post('/api/topics', { data: { title: 'Draft acceptance' } });
  await page.route('**/api/account', route => route.fulfill({ json: { connected: true } }));
  let release; let accepted;
  const received = new Promise(resolve => { accepted = resolve; });
  await page.route('**/api/topics/*/chat', async route => { if (route.request().postDataJSON().message === 'First question') { accepted(); await new Promise(resolve => { release = resolve; }); } await route.fulfill({ json: { ok: true } }); });
  await page.goto('/'); await page.getByRole('navigation').getByRole('button', { name: 'Draft acceptance', exact: true }).click();
  const input = page.getByLabel('Message Lumen'); await input.fill('First question'); await page.getByRole('button', { name: 'Send message', exact: true }).click(); await received;
  await input.fill('New thought while waiting'); release();
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeVisible();
  await expect(input).toHaveValue('New thought while waiting');
  await page.getByRole('button', { name: 'Find sources & a starting point', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Find sources & a starting point', exact: true })).toBeEnabled();
  await expect(input).toHaveValue('New thought while waiting');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(input).toHaveValue(''); await page.reload(); await expect(input).toHaveValue('');
});

test('browser storage being unavailable does not prevent writing or switching topics', async ({ page, request }) => {
  await request.post('/api/topics', { data: { title: 'Memory-only draft' } });
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage blocked', 'SecurityError'); } }); });
  await page.route('**/api/account', route => route.fulfill({ json: { connected: true } }));
  await page.goto('/'); await page.getByRole('navigation').getByRole('button', { name: 'Memory-only draft', exact: true }).click();
  await page.getByLabel('Message Lumen').fill('A thought worth keeping');
  await expect(page.getByText(/Draft kept in this tab only/)).toBeVisible();
  await page.getByRole('button', { name: 'Sources', exact: true }).click();
  await page.getByRole('button', { name: 'Conversation', exact: true }).click();
  await expect(page.getByLabel('Message Lumen')).toHaveValue('A thought worth keeping');
});
