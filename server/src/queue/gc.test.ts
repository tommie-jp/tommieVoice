import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb, type DbHandle } from '../db/client.ts'
import { createAudioStore, type AudioStore } from '../storage/audioStore.ts'
import { truncateAll } from '../../test/helpers/db.ts'
import { seedProcessingPost } from '../../test/helpers/seed.ts'
import { TEST_DATABASE_URL } from '../../test/testDb.ts'
import { collectGarbage } from './gc.ts'

const DAY = 24 * 3600 * 1000
const NOW = Date.parse('2026-10-01T00:00:00Z')

async function aged(file: string, ageMs: number) {
  await mkdir(path.dirname(file), { recursive: true })
  if (!existsSync(file)) await writeFile(file, 'x')
  const t = new Date(NOW - ageMs)
  await utimes(file, t, t)
}

describe('collectGarbage', () => {
  let handle: DbHandle
  let store: AudioStore
  let root: string

  beforeAll(async () => {
    handle = createDb(TEST_DATABASE_URL)
  })
  afterAll(async () => {
    await handle.close()
  })
  beforeEach(async () => {
    await truncateAll(handle.pool)
    root = await mkdtemp(path.join(os.tmpdir(), 'gc-'))
    store = createAudioStore(root)
    return () => rm(root, { recursive: true, force: true })
  })

  it('works on an empty store', async () => {
    await expect(collectGarbage(handle.db, store, NOW)).resolves.toEqual({ removed: 0 })
  })

  it('removes orphan files older than 7 days', async () => {
    const orphanOld = store.absolute('public', '2026/09/0b3c9a34-6f0e-4f3b-9d8a-1f2e3d4c5b6a.m4a')
    const orphanNew = store.absolute('public', '2026/09/1b3c9a34-6f0e-4f3b-9d8a-1f2e3d4c5b6a.m4a')
    await aged(orphanOld, 8 * DAY)
    await aged(orphanNew, 1 * DAY)
    await collectGarbage(handle.db, store, NOW)
    expect(existsSync(orphanOld)).toBe(false)
    expect(existsSync(orphanNew)).toBe(true)
  })

  it('keeps files referenced by live posts and removes failed ones', async () => {
    const live = await seedProcessingPost(handle.db, store, { status: 'ready' })
    const failed = await seedProcessingPost(handle.db, store, { status: 'failed' })
    await aged(store.absolute('original', live.originalPath), 30 * DAY)
    await aged(store.absolute('original', failed.originalPath), 30 * DAY)
    const result = await collectGarbage(handle.db, store, NOW)
    expect(result.removed).toBe(1)
    expect(existsSync(store.absolute('original', live.originalPath))).toBe(true)
    expect(existsSync(store.absolute('original', failed.originalPath))).toBe(false)
  })

  it('removes stale temp files and ignores unknown names', async () => {
    const tmp = path.join(root, 'tmp', 'abc.upload')
    const stray = path.join(root, 'public', 'README.txt')
    await aged(tmp, 2 * DAY)
    await aged(stray, 30 * DAY)
    await collectGarbage(handle.db, store, NOW)
    expect(existsSync(tmp)).toBe(false)
    expect(existsSync(stray)).toBe(true)
  })
})
