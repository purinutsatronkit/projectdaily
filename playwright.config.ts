import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  projects: [
    { name: 'desktop-chrome', use: { browserName: 'chromium', channel: 'chrome', viewport: { width: 1440, height: 900 } } },
    { name: 'mobile-pixel-7', use: { ...devices['Pixel 7'], browserName: 'chromium', channel: 'chrome' } },
  ],
  use: {
    baseURL: 'http://127.0.0.1:4179',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node --import tsx scripts/e2e-server.ts',
    url: 'http://127.0.0.1:4179/api/health',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
