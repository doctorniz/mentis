import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Each test seeds its own OPFS vault in an isolated browser context, so
  // parallel workers don't interfere. ubuntu-latest runners have 4 vCPUs.
  workers: process.env.CI ? 4 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    launchOptions: {
      args: ['--enable-features=SharedArrayBuffer', '--enable-experimental-web-platform-features'],
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
    },
  ],

  webServer: {
    // CI runs against the real production artifact: `pnpm build` (run as a
    // prior workflow step) emits the static export to `out/`, and `serve`
    // hosts it. Locally the dev server keeps the fast iteration loop.
    command: process.env.CI ? 'pnpm exec serve out -l 3000 -L' : 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
