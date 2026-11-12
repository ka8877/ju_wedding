import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e-guests',
  outputDir: 'test-results-guests',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5177',
    ...devices['iPhone 13'],
    defaultBrowserType: 'chromium',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5177 --strictPort',
    url: 'http://127.0.0.1:5177',
    env: { VITE_LOCAL_PREVIEW: 'false', VITE_SUPABASE_URL: 'https://wedding-ui-tests.supabase.co', VITE_SUPABASE_ANON_KEY: 'sb_publishable_e2eOnly' },
    reuseExistingServer: false,
  },
});
