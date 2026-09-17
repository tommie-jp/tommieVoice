import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { PgBoss } from 'pg-boss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createDb, type DbHandle } from '../db/client.ts'
import { findPostRow } from '../modules/posts/repo.ts'
import { QUEUES, startBoss } from '../queue/boss.ts'
import { createQueuePipeline } from '../queue/queuePipeline.ts'
import { createAudioStore, type AudioStore } from '../storage/audioStore.ts'
import { truncateAll } from '../../test/helpers/db.ts'
import { seedProcessingPost } from '../../test/helpers/seed.ts'
import { TEST_DATABASE_URL } from '../../test/testDb.ts'
import { registerJobs } from './runtime.ts'

describe('worker job wiring (pg-boss round trip)', () => {
  let handle: DbHandle
  let store: AudioStore
  let root: string
  let worker: PgBoss
  let api: PgBoss

  beforeAll(async () => {
    handle = createDb(TEST_DATABASE_URL)
    await truncateAll(handle.pool)
    root = await mkdtemp(path.join(os.tmpdir(), 'rt-'))
    store = createAudioStore(root)
    await store.ensureDirs()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    api = await startBoss(TEST_DATABASE_URL, 'api')
    worker = await startBoss(TEST_DATABASE_URL, 'worker')
    await registerJobs(worker, handle, store)
  })
  afterAll(async () => {
    await api.stop({ graceful: false })
    await worker.stop({ graceful: false })
    await handle.close()
    await rm(root, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('enqueues one transcode job per new post and the worker makes it ready', async () => {
    const seeded = await seedProcessingPost(handle.db, store)
    const pipeline = createQueuePipeline(api)
    await expect(
      pipeline.afterUpload({
        id: seeded.id,
        originalPath: seeded.originalPath,
        originalMime: 'audio/webm',
        createdAt: new Date(),
      }),
    ).resolves.toBeNull()
    await vi.waitFor(
      async () => expect((await findPostRow(handle.db, seeded.id))!.status).toBe('ready'),
      { timeout: 15_000, interval: 250 },
    )
  })

  it('marks the post failed after retries are exhausted', async () => {
    const seeded = await seedProcessingPost(handle.db, store)
    await rm(store.absolute('original', seeded.originalPath))
    await api.send(QUEUES.transcode, { postId: seeded.id }, { retryLimit: 0 })
    await vi.waitFor(
      async () => expect((await findPostRow(handle.db, seeded.id))!.status).toBe('failed'),
      { timeout: 15_000, interval: 250 },
    )
  })

  it('runs the gc job on demand', async () => {
    const id = await api.send(QUEUES.gc, {})
    expect(id).toEqual(expect.any(String))
    await vi.waitFor(
      async () => {
        const [job] = await api.findJobs(QUEUES.gc, { id: id! })
        expect(job?.state).toBe('completed')
      },
      { timeout: 15_000, interval: 250 },
    )
  })
})
