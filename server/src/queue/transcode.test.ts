import { existsSync } from 'node:fs'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDb, type DbHandle } from '../db/client.ts'
import { MediaToolError } from '../lib/ffmpeg.ts'
import { findPostRow } from '../modules/posts/repo.ts'
import { createAudioStore, type AudioStore } from '../storage/audioStore.ts'
import { truncateAll } from '../../test/helpers/db.ts'
import { seedProcessingPost } from '../../test/helpers/seed.ts'
import { TEST_DATABASE_URL } from '../../test/testDb.ts'
import { markTranscodeFailed, transcodePost } from './transcode.ts'

describe('transcodePost', () => {
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
    root = await mkdtemp(path.join(os.tmpdir(), 'tc-'))
    store = createAudioStore(root)
    await store.ensureDirs()
    return () => rm(root, { recursive: true, force: true })
  })

  it('marks post ready with public path and probed duration', async () => {
    const seeded = await seedProcessingPost(handle.db, store)
    await expect(transcodePost({ db: handle.db, store }, seeded.id)).resolves.toBe('ready')
    const row = await findPostRow(handle.db, seeded.id)
    expect(row).toMatchObject({ status: 'ready', publicPath: `2026/09/${seeded.id}.m4a` })
    expect(row!.durationMs).toBeGreaterThan(500)
    expect(row!.sizeBytes).toBeGreaterThan(1000)
    expect(existsSync(store.absolute('public', row!.publicPath!))).toBe(true)
    expect(existsSync(store.absolute('original', seeded.originalPath))).toBe(true)
    expect(await readdir(path.join(root, 'tmp'))).toEqual([])
  })

  it('skips posts that are not processing', async () => {
    const seeded = await seedProcessingPost(handle.db, store, { status: 'deleted' })
    await expect(transcodePost({ db: handle.db, store }, seeded.id)).resolves.toBe('skipped')
    await expect(
      transcodePost({ db: handle.db, store }, '0b3c9a34-6f0e-4f3b-9d8a-1f2e3d4c5b6a'),
    ).resolves.toBe('skipped')
  })

  it('deletes original when video stream detected and marks failed', async () => {
    const seeded = await seedProcessingPost(handle.db, store, { fixture: 'with-video.webm' })
    const log = vi.fn()
    await expect(transcodePost({ db: handle.db, store, log }, seeded.id)).resolves.toBe('rejected')
    expect((await findPostRow(handle.db, seeded.id))!.status).toBe('failed')
    expect(existsSync(store.absolute('original', seeded.originalPath))).toBe(false)
    expect(log).toHaveBeenCalled()
  })

  it('throws a MediaToolError and cleans temp files when ffmpeg fails', async () => {
    const seeded = await seedProcessingPost(handle.db, store)
    const exec = vi.fn(async (file: string) => {
      if (file === 'ffprobe') return { stdout: '{"streams":[{"codec_type":"audio"}]}', stderr: '' }
      throw new Error('ffmpeg crashed')
    })
    await expect(transcodePost({ db: handle.db, store, exec }, seeded.id)).rejects.toThrow(
      MediaToolError,
    )
    expect((await findPostRow(handle.db, seeded.id))!.status).toBe('processing')
    expect(await readdir(path.join(root, 'tmp'))).toEqual([])
  })

  it('markTranscodeFailed only touches processing posts', async () => {
    const a = await seedProcessingPost(handle.db, store)
    const b = await seedProcessingPost(handle.db, store, { status: 'ready' })
    await markTranscodeFailed(handle.db, a.id)
    await markTranscodeFailed(handle.db, b.id)
    expect((await findPostRow(handle.db, a.id))!.status).toBe('failed')
    expect((await findPostRow(handle.db, b.id))!.status).toBe('ready')
  })
})
