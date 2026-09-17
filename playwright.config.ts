import { defineConfig, devices } from '@playwright/test'
import { E2E_DATABASE_URL } from './e2e/prepareDb.ts'
import { E2E_ADMIN_TOKEN, E2E_API_PORT, E2E_AUDIO_DIR, E2E_WEB_PORT } from './e2e/env.ts'

const KEY = 'e2e-only-key-0000000000000000000000000000'
const NODE = 'node --disable-warning=ExperimentalWarning'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${E2E_WEB_PORT}`,
    trace: 'retain-on-failure',
    locale: 'ja-JP',
  },
  projects: [
    { name: 'iphone-webkit', use: { ...devices['iPhone 15'] } },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: [
    {
      command: `rm -rf ${E2E_AUDIO_DIR} && ${NODE} e2e/prepareDb.ts && ${NODE} server/src/main.ts`,
      url: `http://127.0.0.1:${E2E_API_PORT}/api/healthz`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: String(E2E_API_PORT),
        DATABASE_URL: E2E_DATABASE_URL,
        ADMIN_TOKEN: E2E_ADMIN_TOKEN,
        HASH_KEY: KEY,
        SESSION_KEY: KEY,
        WORKER_TOKEN: KEY,
        AUDIO_DIR: E2E_AUDIO_DIR,
        PUBLIC_ORIGIN: `http://127.0.0.1:${E2E_WEB_PORT}`,
        SERVE_AUDIO_FROM_API: 'true',
        RELAX_RATE_LIMITS: 'true',
        SYNC_MEDIA: 'true',
        LOG_LEVEL: 'warn',
      },
    },
    {
      command: `npx vite --host 127.0.0.1 --port ${E2E_WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${E2E_WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_API_PROXY: `http://127.0.0.1:${E2E_API_PORT}` },
    },
  ],
})
