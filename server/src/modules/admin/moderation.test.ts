import { existsSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { RATE_LIMITS, RELAXED_RATE_LIMITS } from '../../../../shared/constants.ts'
import { adminHeaders, createTopic, postReply, postThread } from '../../../test/helpers/api.ts'
import { truncateAll } from '../../../test/helpers/db.ts'
import { createTestContext, type TestContext } from '../../../test/helpers/testApp.ts'

describe('reports and moderation', () => {
  let ctx: TestContext
  beforeAll(async () => {
    ctx = await createTestContext({ limits: RELAXED_RATE_LIMITS, ngWords: ['宣伝'] })
  })
  afterAll(async () => {
    await ctx.close()
  })
  beforeEach(async () => {
    await truncateAll(ctx.handle.pool)
  })

  const report = (postId: string, reason: string, ip = '203.0.113.1') =>
    ctx.app.inject({
      method: 'POST',
      url: `/api/posts/${postId}/reports`,
      payload: { reason },
      remoteAddress: ip,
    })
  const admin = (method: 'GET' | 'PATCH' | 'POST', url: string, payload?: object) =>
    ctx.app.inject({ method, url, headers: adminHeaders(), ...(payload ? { payload } : {}) })

  async function publicPathOf(id: string): Promise<string> {
    const { rows } = await ctx.handle.pool.query('SELECT public_path FROM posts WHERE id = $1', [
      id,
    ])
    return rows[0].public_path
  }

  it('creates report with hashed ip', async () => {
    const { slug } = await createTopic(ctx.app)
    const { post } = (await postThread(ctx.app, slug)).json().data
    const res = await report(post.id, 'abuse')
    expect(res.statusCode).toBe(201)
    const { rows } = await ctx.handle.pool.query('SELECT ip_hash, reason FROM reports')
    expect(rows).toHaveLength(1)
    expect(rows[0].reason).toBe('abuse')
    expect(rows[0].ip_hash).not.toContain('203.0.113.1')
  })

  it('same ip cannot report same post twice (409) but others can', async () => {
    const { slug } = await createTopic(ctx.app)
    const { post } = (await postThread(ctx.app, slug)).json().data
    await report(post.id, 'spam')
    expect((await report(post.id, 'abuse')).statusCode).toBe(409)
    expect((await report(post.id, 'abuse', '203.0.113.2')).statusCode).toBe(201)
  })

  it('rejects unknown reasons and unknown posts', async () => {
    const { slug } = await createTopic(ctx.app)
    const { post } = (await postThread(ctx.app, slug)).json().data
    expect((await report(post.id, 'boring')).statusCode).toBe(400)
    expect((await report('0b3c9a34-6f0e-4f3b-9d8a-1f2e3d4c5b6a', 'spam')).statusCode).toBe(404)
  })

  it('admin lists unresolved reports with post summary', async () => {
    const { slug } = await createTopic(ctx.app)
    const { post, thread } = (
      await postThread(ctx.app, slug, { fields: { title: '問題の声' } })
    ).json().data
    await report(post.id, 'abuse', '203.0.113.1')
    await report(post.id, 'abuse', '203.0.113.2')
    await report(post.id, 'privacy', '203.0.113.3')
    expect((await ctx.app.inject({ method: 'GET', url: '/api/admin/reports' })).statusCode).toBe(
      401,
    )
    const res = await admin('GET', '/api/admin/reports')
    expect(res.json().data).toEqual([
      expect.objectContaining({
        count: 3,
        reasons: { abuse: 2, privacy: 1, copyright: 0, spam: 0, other: 0 },
        post: expect.objectContaining({
          id: post.id,
          threadId: thread.id,
          title: '問題の声',
          status: 'ready',
          hasAudio: true,
        }),
      }),
    ])
    const resolved = await admin('POST', `/api/admin/posts/${post.id}/resolve-reports`)
    expect(resolved.json().data.resolved).toBe(3)
    expect((await admin('GET', '/api/admin/reports')).json().data).toEqual([])
  })

  it('hidden post is excluded from listings and its audio moves out of public', async () => {
    const { slug } = await createTopic(ctx.app)
    const first = (await postThread(ctx.app, slug)).json().data
    const second = (await postReply(ctx.app, first.thread.id)).json().data
    await report(second.post.id, 'abuse')
    const rel = await publicPathOf(second.post.id)

    const hidden = await admin('PATCH', `/api/admin/posts/${second.post.id}`, { status: 'hidden' })
    expect(hidden.json().data.status).toBe('hidden')
    expect(existsSync(`${ctx.audioDir}/public/${rel}`)).toBe(false)
    expect(existsSync(`${ctx.audioDir}/quarantine/${rel}`)).toBe(true)
    const detail = (
      await ctx.app.inject({ method: 'GET', url: `/api/threads/${first.thread.id}` })
    ).json().data
    expect(detail.posts.map((p: { seq: number }) => p.seq)).toEqual([1])
    expect((await admin('GET', '/api/admin/reports')).json().data).toEqual([])

    const audio = await admin('GET', `/api/admin/posts/${second.post.id}/audio`)
    expect(audio.statusCode).toBe(200)
    expect(audio.headers['content-type']).toBe('audio/webm')
    expect(audio.rawPayload.length).toBeGreaterThan(100)
  })

  it('restoring hidden post makes it visible again', async () => {
    const { slug } = await createTopic(ctx.app)
    const { post, thread } = (await postThread(ctx.app, slug)).json().data
    await admin('PATCH', `/api/admin/posts/${post.id}`, { status: 'hidden' })
    const restored = await admin('PATCH', `/api/admin/posts/${post.id}`, { status: 'ready' })
    expect(restored.json().data.status).toBe('ready')
    expect(existsSync(`${ctx.audioDir}/public/${await publicPathOf(post.id)}`)).toBe(true)
    expect(
      (await ctx.app.inject({ method: 'GET', url: `/api/threads/${thread.id}` })).statusCode,
    ).toBe(200)
    expect(
      (await admin('PATCH', `/api/admin/posts/${post.id}`, { status: 'ready' })).statusCode,
    ).toBe(409)
  })

  it('cannot restore a post hidden before conversion', async () => {
    const { slug } = await createTopic(ctx.app)
    const { post } = (await postThread(ctx.app, slug)).json().data
    await ctx.handle.pool.query(
      "UPDATE posts SET public_path = NULL, status = 'hidden' WHERE id = $1",
      [post.id],
    )
    expect(
      (await admin('PATCH', `/api/admin/posts/${post.id}`, { status: 'ready' })).statusCode,
    ).toBe(409)
  })

  it('admin delete removes every copy and then 404s', async () => {
    const { slug } = await createTopic(ctx.app)
    const { post } = (await postThread(ctx.app, slug)).json().data
    const rel = await publicPathOf(post.id)
    await admin('PATCH', `/api/admin/posts/${post.id}`, { status: 'hidden' })
    const res = await admin('PATCH', `/api/admin/posts/${post.id}`, { status: 'deleted' })
    expect(res.json().data.status).toBe('deleted')
    expect(existsSync(`${ctx.audioDir}/quarantine/${rel}`)).toBe(false)
    expect(
      (await admin('PATCH', `/api/admin/posts/${post.id}`, { status: 'hidden' })).statusCode,
    ).toBe(404)
    expect((await admin('GET', `/api/admin/posts/${post.id}/audio`)).statusCode).toBe(404)
  })

  it('admin can look up a single post and gets 404 for unknown ids', async () => {
    const { slug } = await createTopic(ctx.app)
    const { post } = (await postThread(ctx.app, slug)).json().data
    expect((await admin('GET', `/api/admin/posts/${post.id}`)).json().data.id).toBe(post.id)
    const unknown = '0b3c9a34-6f0e-4f3b-9d8a-1f2e3d4c5b6a'
    expect((await admin('GET', `/api/admin/posts/${unknown}`)).statusCode).toBe(404)
    expect((await admin('GET', `/api/admin/posts/${unknown}/audio`)).statusCode).toBe(404)
    expect(
      (await admin('PATCH', `/api/admin/posts/${unknown}`, { status: 'hidden' })).statusCode,
    ).toBe(404)
    expect(
      (await admin('PATCH', `/api/admin/posts/${post.id}`, { status: 'failed' })).statusCode,
    ).toBe(400)
  })

  it('rejects titles and names containing NG words', async () => {
    const { slug } = await createTopic(ctx.app)
    const res = await postThread(ctx.app, slug, { fields: { title: 'これは宣伝です' } })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.message).toContain('使えない言葉')
    const ok = (await postThread(ctx.app, slug)).json().data
    const reply = await postReply(ctx.app, ok.thread.id, { fields: { authorName: 'ｾﾝﾃﾞﾝ宣伝' } })
    expect(reply.statusCode).toBe(400)
  })
})

describe('report rate limit', () => {
  it('11th report per hour from same ip gets 429', async () => {
    const ctx = await createTestContext({
      limits: { ...RATE_LIMITS, global: { max: 1000, windowMs: 60_000 } },
    })
    try {
      await truncateAll(ctx.handle.pool)
      const { slug } = await createTopic(ctx.app)
      const statuses: number[] = []
      for (let i = 0; i < 11; i += 1) {
        const { post } = (await postThread(ctx.app, slug)).json().data ?? {
          post: { id: '0b3c9a34-6f0e-4f3b-9d8a-1f2e3d4c5b6a' },
        }
        const res = await ctx.app.inject({
          method: 'POST',
          url: `/api/posts/${post.id}/reports`,
          payload: { reason: 'spam' },
        })
        statuses.push(res.statusCode)
      }
      expect(statuses.at(-1)).toBe(429)
    } finally {
      await ctx.close()
    }
  })
})
