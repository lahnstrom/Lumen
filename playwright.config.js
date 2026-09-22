import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/browser', workers: 1, use: { baseURL: 'http://localhost:4319', headless: true }, webServer: { command: 'node server/index.js', url: 'http://localhost:4319', env: { PORT: '4319', LUMEN_DATA_DIR: `/tmp/lumen-e2e-${process.pid}` }, reuseExistingServer: false }, reporter: 'list' });
