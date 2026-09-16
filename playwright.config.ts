import { defineConfig, devices } from '@playwright/test';

/**
 * Browser smoke tests, run against the production build.
 *
 * The unit tests cover the logic; these cover what only a page shows: the controllers,
 * storage across reloads, real simulation workers, and fresh-browser links. Build first
 * (`npm run build`), then `npm run e2e`. Nothing reaches the network: the bot's API is
 * mocked per test and every other outside request is refused.
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
