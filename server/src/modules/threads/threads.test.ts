import { readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTopic, postReply, postThread } from '../../../test/helpers/api.ts'
import { truncateAll } from '../../../test/helpers/db.ts'
import { fixture } from '../../../test/helpers/multipart.ts'
import { createTestContext, type TestContext } from '../../../test/helpers/testApp.ts'
import { RELAXED_RATE_LIMITS } from '../../../../shared/constants.ts'

const RELAXED = RELAXED_RATE_LIMITS

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  return entries.filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name))
}

describe('threads and posts API', () => {
  let ctx: TestContext
  let slug: string

  beforeAll(async () => {
    ctx = await createTestContext({ limits: RELAXED })
  })
  afterAll(async () => {
    await ctx.close()
  })
  beforeEach(async () => {
    await truncateAll(ctx.handle.pool)
    for (const area of ['original', 'public', 'tmp']) {
      await rm(path.join(ctx.audioDir, area), { recursive: true, force: true })
    }
    ctx.clock.set('2026-09-18T12:00:00.000Z')
    slug = (await createTopic(ctx.app)).slug
  })

  it('creates thread and first post with seq 1 and returns deleteToken once', async () => {
    const res = await postThread(ctx.app, slug, { fields: { authorName: '名無しの声優' } })
    expect(res.statusCode).toBe(201)
    const { thread, post, deleteToken } = res.json().data
    expect(thread).toMatchObject({ topicSlug: slug, title: '最初の声', postCount: 1 })
    expect(post).toMatchObject({ seq: 1, authorName: '名無しの声優', status: 'ready' })
    expect(post.audioUrl).toMatch(/^\/audio\/public\/2026\/09\/[0-9a-f-]+\.webm$/)
    expect(deleteToken.length).toBeGreaterThan(20)

    const again = await ctx.app.inject({ method: 'GET', url: `/api/posts/${post.id}` })
    expect(again.body).not.toContain(deleteToken)
  })

  it('stores hashed device id and ip, never raw', async () => {
    const deviceId = '11111111-2222-4333-8444-555555555555'
    await postThread(ctx.app, slug, { deviceId, ip: '203.0.113.7' })
    const { rows } = await ctx.handle.pool.query(
      'SELECT device_id_hash, ip_hash, delete_token_hash FROM posts',
    )
    const row = rows[0]
    expect(row.device_id_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(rows)).not.toContain(deviceId)
    expect(JSON.stringify(rows)).not.toContain('203.0.113.7')
  })

  it('requires a device id header', async () => {
    const res = await postThread(ctx.app, slug, { deviceId: 'not-a-uuid' })
    expect(res.statusCode).toBe(400)
  })

  it('requires a thread title', async () => {
    const res = await postThread(ctx.app, slug, { fields: { title: ' ' } })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('validation_error')
    expect(await listFiles(path.join(ctx.audioDir, 'original'))).toEqual([])
  })

  it('rejects file over 8MB with 413 and leaves no file on disk', async () => {
    const big = Buffer.concat([fixture('sample.webm'), Buffer.alloc(8 * 1024 * 1024 + 10)])
    const res = await postThread(ctx.app, slug, { file: { data: big } })
    expect(res.statusCode).toBe(413)
    expect(res.json().error.code).toBe('payload_too_large')
    expect(await listFiles(ctx.audioDir)).toEqual([])
  })

  it('rejects non-audio bytes with 415 even when labelled as audio', async () => {
    const res = await postThread(ctx.app, slug, {
      file: { data: Buffer.from('<script>alert(1)</script>'), contentType: 'audio/webm' },
    })
    expect(res.statusCode).toBe(415)
    expect(await listFiles(ctx.audioDir)).toEqual([])
  })

  it('rejects a request without an audio part', async () => {
    const res = await postThread(ctx.app, slug, { file: null })
    expect(res.statusCode).toBe(400)
  })

  it('rejects a file sent under another field name', async () => {
    const res = await postThread(ctx.app, slug, {
      file: { field: 'image', data: fixture('sample.webm') },
    })
    expect(res.statusCode).toBe(400)
    expect(await listFiles(ctx.audioDir)).toEqual([])
  })

  it('rejects non-multipart bodies', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/topics/${slug}/threads`,
      headers: { 'x-device-id': '11111111-2222-4333-8444-555555555555' },
      payload: { title: 'x' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('accepts m4a from iOS and keeps the extension', async () => {
    const res = await postThread(ctx.app, slug, {
      file: { data: fixture('sample.m4a'), contentType: 'audio/mp4', filename: 'v.m4a' },
    })
    expect(res.json().data.post.audioUrl).toMatch(/\.m4a$/)
  })

  it('404s for an unknown topic', async () => {
    const res = await postThread(ctx.app, 'no-such-topic')
    expect(res.statusCode).toBe(404)
  })

  it('lists threads newest first with cursor pagination', async () => {
    for (const [i, minute] of ['01', '02', '03'].entries()) {
      ctx.clock.set(`2026-09-18T12:${minute}:00.000Z`)
      await postThread(ctx.app, slug, { fields: { title: `t${i}` } })
    }
    const first = await ctx.app.inject({
      method: 'GET',
      url: `/api/topics/${slug}/threads?limit=2`,
    })
    const page1 = first.json()
    expect(page1.data.map((t: { title: string }) => t.title)).toEqual(['t2', 't1'])
    expect(page1.meta.nextCursor).toEqual(expect.any(String))

    const second = await ctx.app.inject({
      method: 'GET',
      url: `/api/topics/${slug}/threads?limit=2&cursor=${page1.meta.nextCursor}`,
    })
    expect(second.json().data.map((t: { title: string }) => t.title)).toEqual(['t0'])
    expect(second.json().meta.nextCursor).toBeNull()
  })

  it('a late reply never moves lastPostAt backwards', async () => {
    ctx.clock.set('2026-09-18T12:05:00.000Z')
    const a = (await postThread(ctx.app, slug)).json().data
    ctx.clock.set('2026-09-18T12:01:00.000Z')
    await postReply(ctx.app, a.thread.id)
    const res = await ctx.app.inject({ method: 'GET', url: `/api/threads/${a.thread.id}` })
    expect(res.json().data.thread.lastPostAt).toBe('2026-09-18T12:05:00.000Z')
  })

  it('a reply moves its thread to the top', async () => {
    ctx.clock.set('2026-09-18T12:01:00.000Z')
    const older = (await postThread(ctx.app, slug, { fields: { title: 'older' } })).json().data
    ctx.clock.set('2026-09-18T12:02:00.000Z')
    await postThread(ctx.app, slug, { fields: { title: 'newer' } })
    ctx.clock.set('2026-09-18T12:03:00.000Z')
    await postReply(ctx.app, older.thread.id)
    const res = await ctx.app.inject({ method: 'GET', url: `/api/topics/${slug}/threads` })
    expect(res.json().data[0]).toMatchObject({ title: 'older', postCount: 2 })
  })

  it('rejects a bad cursor', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/topics/${slug}/threads?cursor=garbage`,
    })
    expect(res.statusCode).toBe(400)
  })

  it('reply references parent post in same thread only', async () => {
    const a = (await postThread(ctx.app, slug)).json().data
    const b = (await postThread(ctx.app, slug)).json().data
    const ok = await postReply(ctx.app, a.thread.id, { fields: { parentPostId: a.post.id } })
    expect(ok.json().data.post).toMatchObject({ seq: 2, parentPostId: a.post.id, parentSeq: 1 })

    const cross = await postReply(ctx.app, a.thread.id, { fields: { parentPostId: b.post.id } })
    expect(cross.statusCode).toBe(400)
    expect(await listFiles(path.join(ctx.audioDir, 'original'))).toHaveLength(3)
  })

  it('concurrent replies get unique sequential seq', async () => {
    const a = (await postThread(ctx.app, slug)).json().data
    const results = await Promise.all(
      Array.from({ length: 10 }, () => postReply(ctx.app, a.thread.id)),
    )
    expect(results.every((r) => r.statusCode === 201)).toBe(true)
    const seqs = results.map((r) => r.json().data.post.seq).sort((x, y) => x - y)
    expect(seqs).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('returns thread detail with posts in order', async () => {
    const a = (await postThread(ctx.app, slug)).json().data
    await postReply(ctx.app, a.thread.id, { fields: { title: '返事' } })
    const res = await ctx.app.inject({ method: 'GET', url: `/api/threads/${a.thread.id}` })
    const detail = res.json().data
    expect(detail.thread).toMatchObject({
      postCount: 2,
      topicTitle: 'テスト',
      topicIsClosed: false,
    })
    expect(detail.posts.map((p: { seq: number }) => p.seq)).toEqual([1, 2])
  })

  it('hides failed posts and 404s for threads without visible posts', async () => {
    const a = (await postThread(ctx.app, slug)).json().data
    await ctx.handle.pool.query("UPDATE posts SET status = 'hidden'")
    expect(
      (await ctx.app.inject({ method: 'GET', url: `/api/threads/${a.thread.id}` })).statusCode,
    ).toBe(404)
    expect(
      (await ctx.app.inject({ method: 'GET', url: `/api/posts/${a.post.id}` })).statusCode,
    ).toBe(404)
    const list = await ctx.app.inject({ method: 'GET', url: `/api/topics/${slug}/threads` })
    expect(list.json().data).toEqual([])
    expect((await postReply(ctx.app, a.thread.id)).statusCode).toBe(404)
  })

  it('404s for unknown thread and post ids and 400s for malformed ids', async () => {
    const unknown = '0b3c9a34-6f0e-4f3b-9d8a-1f2e3d4c5b6a'
    expect(
      (await ctx.app.inject({ method: 'GET', url: `/api/threads/${unknown}` })).statusCode,
    ).toBe(404)
    expect((await ctx.app.inject({ method: 'GET', url: `/api/posts/${unknown}` })).statusCode).toBe(
      404,
    )
    expect((await ctx.app.inject({ method: 'GET', url: '/api/threads/abc' })).statusCode).toBe(400)
    expect((await postReply(ctx.app, unknown)).statusCode).toBe(404)
  })

  it('marks the post failed when the media pipeline throws', async () => {
    const broken = await createTestContext({
      limits: RELAXED,
      media: { afterUpload: () => Promise.reject(new Error('ffmpeg missing')) },
    })
    try {
      const topic = await createTopic(broken.app)
      const res = await postThread(broken.app, topic.slug)
      expect(res.statusCode).toBe(201)
      expect(res.json().data).toMatchObject({ post: null, thread: null })
      const topics = (await broken.app.inject({ method: 'GET', url: '/api/topics' })).json().data
      expect(topics[0].threadCount).toBe(0)
      const { rows } = await broken.handle.pool.query('SELECT status FROM posts')
      expect(rows).toEqual([{ status: 'failed' }])
    } finally {
      await broken.close()
    }
  })

  it('keeps a post processing when the pipeline defers work', async () => {
    const deferred = await createTestContext({
      limits: RELAXED,
      media: { afterUpload: () => Promise.resolve(null) },
    })
    try {
      const topic = await createTopic(deferred.app)
      const res = await postThread(deferred.app, topic.slug)
      expect(res.json().data.post).toMatchObject({ status: 'processing', audioUrl: null })
    } finally {
      await deferred.close()
    }
  })
})
