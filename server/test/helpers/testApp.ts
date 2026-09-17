import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import { buildApp, type AppDeps } from '../../src/app.ts'
import { loadConfig, type AppConfig } from '../../src/config.ts'
import { createDb, type DbHandle } from '../../src/db/client.ts'
import { fixedClock } from '../../src/lib/clock.ts'
import { TEST_DATABASE_URL } from '../testDb.ts'

export type TestContext = {
  app: FastifyInstance
  handle: DbHandle
  config: AppConfig
  clock: ReturnType<typeof fixedClock>
  audioDir: string
  close(): Promise<void>
}

export type TestOverrides = Partial<Omit<AppDeps, 'config' | 'db' | 'clock'>> & {
  env?: Record<string, string>
}

export const TEST_NOW = '2026-09-18T12:00:00.000Z'

export async function createTestContext(overrides: TestOverrides = {}): Promise<TestContext> {
  const audioDir = await mkdtemp(path.join(os.tmpdir(), 'tv-audio-'))
  const config = loadConfig({
    ...process.env,
    DATABASE_URL: TEST_DATABASE_URL,
    AUDIO_DIR: audioDir,
    ...overrides.env,
  })
  const handle = createDb(TEST_DATABASE_URL)
  const clock = fixedClock(TEST_NOW)
  const { env: _env, ...depOverrides } = overrides
  void _env
  const app = await buildApp({
    config,
    db: handle.db,
    clock,
    pingDb: () => handle.ping(),
    ...depOverrides,
  })
  return {
    app,
    handle,
    config,
    clock,
    audioDir,
    async close() {
      await app.close()
      await handle.close()
      await rm(audioDir, { recursive: true, force: true })
    },
  }
}
