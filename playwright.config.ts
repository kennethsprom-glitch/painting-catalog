import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    browserName: 'chromium',
    baseURL: 'http://127.0.0.1:47322/painting-catalog/',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: devices['iPhone 13'].userAgent,
    colorScheme: 'light',
    headless: true,
    serviceWorkers: 'allow',
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://127.0.0.1:47322/painting-catalog/',
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
