import {defineConfig} from '@playwright/test';

const port = 4300;

/**
 * End-to-end configuration. The mock backend serves the production build and the
 * scripted feed. Set CHROMIUM_PATH to use a browser already on the machine;
 * otherwise Playwright's own download is used.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    launchOptions: process.env['CHROMIUM_PATH']
      ? {executablePath: process.env['CHROMIUM_PATH']}
      : {},
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node e2e/mock-backend.mjs',
    url: `http://127.0.0.1:${port}/__control/stats`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
