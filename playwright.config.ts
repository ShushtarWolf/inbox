import { defineConfig, devices } from '@playwright/test'

/** Local macOS 12 cannot install Playwright WebKit — force Chromium+iPhone for smoke. */
const iosTapUseChromium = process.env.IOS_TAP_BROWSER === 'chromium'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // Phone-chrome / iOS tap guards are WebKit-only (Desktop Chrome hides max-[430px] UI).
      testIgnore: /ios-safari-taps\.spec\.ts/,
    },
    {
      name: 'webkit-mobile',
      use: {
        ...devices['iPhone 13'],
        ...(iosTapUseChromium ? { browserName: 'chromium' as const } : {}),
      },
      testMatch: /ios-safari-taps\.spec\.ts/,
    },
  ],
})
