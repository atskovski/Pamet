'use strict';

const { defineConfig, devices } = require('@playwright/test');

const externalBaseURL = process.env.PAMET_UI_BASE_URL || '';
const localBaseURL = 'http://127.0.0.1:8080';

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 25_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  outputDir: 'test-results/ui-integrity',
  use: {
    baseURL: externalBaseURL || localBaseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    serviceWorkers: 'block',
    actionTimeout: 7_500,
    navigationTimeout: 12_000
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
    },
    {
      name: 'desktop-firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } }
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 5'] }
    }
  ],
  webServer: externalBaseURL ? undefined : {
    command: 'node secure-server.js',
    url: `${localBaseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 45_000,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: '8080',
      APP_BASE_URL: localBaseURL,
      AUTO_MIGRATE: 'true',
      DISABLE_RATE_LIMITS: 'true',
      DISABLE_BREACHED_PASSWORD_CHECK: 'true',
      IDENTITY_ENCRYPTION_KEY: process.env.IDENTITY_ENCRYPTION_KEY || '3333333333333333333333333333333333333333333333333333333333333333'
    }
  }
});
