import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('account page downloads a verified workspace archive', async ({ page, request }) => {
  await request.post('/api/topics', { data: { title: 'Backup learning space' } });
  await page.route('**/api/account', route => route.fulfill({ json: { connected: true } }));
  await page.goto('/'); await page.getByRole('button', { name: /Codex connected/ }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download complete archive' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/^lumen-workspace-\d{4}-\d{2}-\d{2}\.zip$/);
  const { stdout } = await promisify(execFile)('python3', ['scripts/workspace-backup.py', 'verify', await download.path()]);
  expect(JSON.parse(stdout).verified).toBe(true);
  expect(JSON.parse(stdout).topics).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Download complete archive' })).toBeEnabled();
});

test('backup preparation errors are visible and can be retried', async ({ page }) => {
  await page.route('**/api/account', route => route.fulfill({ json: { connected: true } }));
  await page.route('**/api/backup/archive', route => route.fulfill({ status: 500, json: { error: 'Not enough space to prepare the archive.' } }));
  await page.goto('/'); await page.getByRole('button', { name: /Codex connected/ }).click();
  await page.getByRole('button', { name: 'Download complete archive' }).click();
  await expect(page.getByRole('alert')).toContainText('Not enough space');
  await expect(page.getByRole('button', { name: 'Download complete archive' })).toBeEnabled();
});
