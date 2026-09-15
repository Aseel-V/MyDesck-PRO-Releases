import { defineConfig } from '@playwright/test';

/**
 * Browser smoke of the Firebase production root (src/firebase-main.tsx) on the local emulators.
 *
 * global-setup.mjs starts the dev server on its own port (never reusing one already listening: a server in
 * the shipped Supabase mode must not be mistaken for the Firebase root) and stops it when the run ends.
 * Synthetic tenants are created through the application's registration repository before the run and
 * removed after it.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     npx playwright test --config e2e/firebase/playwright.config.ts [supermarket.spec.ts]
 */
const PORT = Number(process.env.MYDESCK_SMOKE_PORT ?? 5180);
/** The installed browser: Microsoft Edge ships with Windows, so no Playwright browser download is needed. */
const CHANNEL = process.env.MYDESCK_SMOKE_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined);

export default defineConfig({
  testDir: '.',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  globalSetup: './global-setup.mjs',
  globalTeardown: './global-teardown.mjs',
  outputDir: '../../migration/full-vertical.local/ui-smoke-artifacts',
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...(CHANNEL ? { channel: CHANNEL } : {}),
    viewport: { width: 1600, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
