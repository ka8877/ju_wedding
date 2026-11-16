import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/production',
  outputDir: 'test-results-production',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  use: {
    baseURL: 'https://hyunbeom-juyoung.pages.dev/',
    ...devices['iPhone 13'],
    browserName: 'chromium',
    reducedMotion: 'no-preference',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
      args: ['--no-sandbox'],
    },
    trace: 'off',
  },
});
