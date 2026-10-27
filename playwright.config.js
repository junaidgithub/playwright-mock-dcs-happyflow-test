const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: true,
  // Capped so browser shutdown (trace/video flush) is not starved on a busy local machine.
  workers: 2,
  forbidOnly: !!process.env.CI,
  // No retries: a retry would hide flaky automation behind a green result.
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Video is recorded for every test and encoded at context close, which timed out teardown
    // under load. Trace + screenshot already cover failures; opt in with PW_VIDEO=1.
    video: process.env.PW_VIDEO ? 'retain-on-failure' : 'off',
    actionTimeout: 5_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'npm start', url: 'http://127.0.0.1:3000', reuseExistingServer: !process.env.CI, timeout: 10_000 }
});
