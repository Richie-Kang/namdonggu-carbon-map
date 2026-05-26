import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // reason: `pnpm exec next start -p 3000` parses '-p 3000' as positional
    // args under pnpm, so Next.js treats '--port' as the project directory.
    // `pnpm start` shells through the package script and respects PORT.
    command: process.env.CI ? 'pnpm start' : 'pnpm dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://stub.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'stub',
      SKIP_MODEL_HEALTH: '1',
      PORT: '3000',
    },
  },
});
