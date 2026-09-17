import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { RELAXED_RATE_LIMITS } from '../../../../shared/constants.ts'
import {
  adminHeaders,
  createInbox,
  createStreamer,
  createTopic,
  CSRF,
  loginStreamer,
  postReply,
  postThread,
} from '../../../test/helpers/api.ts'
import { truncateAll } from '../../../test/helpers/db.ts'
import { createTestContext, type TestContext } from '../../../test/helpers/testApp.ts'
import type { AiredEvent } from './routes.ts'

describe('streamer accounts and inbox', () => {
  let ctx: TestContext
  const aired: AiredEvent[] = []

  beforeAll(async () => {
    ctx = await createTestContext({ limits: RELAXED_RATE_LIMITS, onAir: (e) => aired.push(e) })
  })
  afterAll(async () => {
    await ctx.close()
  })
  beforeEach(async () => {
    await truncateAll(ctx.handle.pool)
    aired.length = 0
  })

  const get = (url: string, cookie?: string) =>
    ctx.app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} })
  const send = (
    method: 'POST' | 'PATCH' | 'DELETE',
    url: string,
    cookie: string,
    payload?: object,
  ) =>
    ctx.app.inject({ method, url, headers: { cookie, ...CSRF }, ...(payload ? { payload } : {}) })

  describe('session', () => {
    it('admin issues a login key once and stores only its hash', async () => {
      const { streamer, loginKey } = await createStreamer(ctx.app)
      const { rows } = await ctx.handle.pool.query('SELECT login_key_hash FROM streamers')
      expect(rows[0].login_key_hash).toMatch(/^[0-9a-f]{64}$/)
      expect(JSON.stringify(rows)).not.toContain(loginKey)
      const list = await ctx.app.inject({
        method: 'GET',
        url: '/api/admin/streamers',
        headers: adminHeaders(),
      })
      expect(list.json().data).toEqual([
        expect.objectContaining({ id: streamer.id, disabled: false }),
      ])
      expect(list.body).not.toContain(loginKey)
    })

    it('login with valid key sets httponly cookie', async () => {
      const { loginKey } = await createStreamer(ctx.app)
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/streamer/session',
        headers: CSRF,
        payload: { loginKey },
      })
      const cookie = res.cookies.find((c) => c.name === 'tv_streamer')!
      expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api' })
      const me = await get('/api/streamer/me', `tv_streamer=${cookie.value}`)
      expect(me.json().data).toMatchObject({ displayName: '配信者A', counts: { pending: 0 } })
    })

    it('wrong key returns 401 and repeated failures are rate limited', async () => {
      const codes: number[] = []
      for (let i = 0; i < 11; i += 1) {
        const res = await ctx.app.inject({
          method: 'POST',
          url: '/api/streamer/session',
          headers: CSRF,
          payload: { loginKey: 'x'.repeat(43) },
          remoteAddress: '198.51.100.99',
        })
        codes.push(res.statusCode)
      }
      expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true)
      expect(codes[10]).toBe(429)
    })

    it('rotated key invalidates old key and old sessions', async () => {
      const { streamer, loginKey } = await createStreamer(ctx.app)
      const cookie = await loginStreamer(ctx.app, loginKey)
      const rotated = await ctx.app.inject({
        method: 'POST',
        url: `/api/admin/streamers/${streamer.id}/rotate-key`,
        headers: adminHeaders(),
      })
      const newKey = rotated.json().data.loginKey
      expect(newKey).not.toBe(loginKey)
      expect((await get('/api/streamer/me', cookie)).statusCode).toBe(401)
      await expect(loginStreamer(ctx.app, loginKey)).rejects.toThrow('401')
      await expect(loginStreamer(ctx.app, newKey)).resolves.toContain('tv_streamer=')
    })

    it('disabled streamers cannot use their session', async () => {
      const { streamer, loginKey } = await createStreamer(ctx.app)
      const cookie = await loginStreamer(ctx.app, loginKey)
      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/admin/streamers/${streamer.id}`,
        headers: adminHeaders(),
        payload: { disabled: true },
      })
      expect(res.json().data.disabled).toBe(true)
      expect((await get('/api/streamer/me', cookie)).statusCode).toBe(401)
    })

    it('mutating request without custom header is rejected with 403', async () => {
      const { loginKey } = await createStreamer(ctx.app)
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/streamer/session',
        payload: { loginKey },
      })
      expect(res.statusCode).toBe(403)
      const cookie = await loginStreamer(ctx.app, loginKey)
      const noHeader = await ctx.app.inject({
        method: 'PATCH',
        url: '/api/streamer/posts/0b3c9a34-6f0e-4f3b-9d8a-1f2e3d4c5b6a',
        headers: { cookie },
        payload: { reviewStatus: 'approved' },
      })
      expect(noHeader.statusCode).toBe(403)
    })

    it('logout clears the cookie', async () => {
      const { loginKey } = await createStreamer(ctx.app)
      const cookie = await loginStreamer(ctx.app, loginKey)
      const res = await send('DELETE', '/api/streamer/session', cookie)
      expect(res.cookies.find((c) => c.name === 'tv_streamer')?.value).toBe('')
    })

    it('404s for unknown streamer ids in admin routes', async () => {
      const unknown = '0b3c9a34-6f0e-4f3b-9d8a-1f2e3d4c5b6a'
      const rotate = await ctx.app.inject({
        method: 'POST',
        url: `/api/admin/streamers/${unknown}/rotate-key`,
        headers: adminHeaders(),
      })
      const patch = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/admin/streamers/${unknown}`,
        headers: adminHeaders(),
        payload: { disabled: true },
      })
      expect([rotate.statusCode, patch.statusCode]).toEqual([404, 404])
    })
  })

  describe('inbox topics', () => {
    it('requires an existing owner and defaults to aired publishing with transcription', async () => {
      const bad = await ctx.app.inject({
        method: 'POST',
        url: '/api/admin/topics',
        headers: adminHeaders(),
        payload: { slug: 'no-owner', title: 'x', mode: 'inbox' },
      })
      expect(bad.statusCode).toBe(400)
      const missing = await ctx.app.inject({
        method: 'POST',
        url: '/api/admin/topics',
        headers: adminHeaders(),
        payload: {
          slug: 'ghost',
          title: 'x',
          mode: 'inbox',
          ownerId: '0b3c9a34-6f0e-4f3b-9d8a-1f2e3d4c5b6a',
        },
      })
      expect(missing.statusCode).toBe(400)
      const { streamer } = await createStreamer(ctx.app)
      const topic = await createInbox(ctx.app, streamer.id)
      expect(topic).toMatchObject({ mode: 'inbox', publishOn: 'aired', ownerName: '配信者A' })
      const { rows } = await ctx.handle.pool.query('SELECT transcribe FROM topics')
      expect(rows[0].transcribe).toBe(true)
      const patch = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/admin/topics/${topic.id}`,
        headers: adminHeaders(),
        payload: { ownerId: '0b3c9a34-6f0e-4f3b-9d8a-1f2e3d4c5b6a' },
      })
      expect(patch.statusCode).toBe(400)
    })

    it('new post in inbox topic starts pending and is hidden from the public', async () => {
      const { streamer } = await createStreamer(ctx.app)
      const topic = await createInbox(ctx.app, streamer.id)
      const res = await postThread(ctx.app, topic.slug)
      expect(res.statusCode).toBe(201)
      const { post, thread } = res.json().data
      expect(post).toMatchObject({ reviewStatus: 'pending', status: 'ready' })
      expect(thread).toBeNull()
      expect((await get(`/api/posts/${post.id}`)).statusCode).toBe(404)
      expect((await get(`/api/threads/${post.threadId}`)).statusCode).toBe(404)
      expect((await get(`/api/topics/${topic.slug}/threads`)).json().data).toEqual([])
      expect((await get('/api/topics')).json().data[0].threadCount).toBe(0)
      expect((await postReply(ctx.app, post.threadId)).statusCode).toBe(404)
      expect((await get(`/s/p/${post.id}`)).statusCode).toBe(404)
    })

    it('streamer sees only own topics posts', async () => {
      const a = await createStreamer(ctx.app, 'A')
      const b = await createStreamer(ctx.app, 'B')
      const topicA = await createInbox(ctx.app, a.streamer.id)
      await createInbox(ctx.app, b.streamer.id)
      const board = await createTopic(ctx.app)
      const { post } = (
        await postThread(ctx.app, topicA.slug, { fields: { title: 'A宛て' } })
      ).json().data
      await postThread(ctx.app, board.slug)
      const cookieA = await loginStreamer(ctx.app, a.loginKey)
      const cookieB = await loginStreamer(ctx.app, b.loginKey)
      const inboxA = (await get('/api/streamer/inbox?status=pending', cookieA)).json().data
      expect(inboxA).toEqual([
        expect.objectContaining({
          threadTitle: 'A宛て',
          transcriptState: 'queued',
          post: expect.objectContaining({ id: post.id }),
        }),
      ])
      expect((await get('/api/streamer/inbox', cookieB)).json().data).toEqual([])
      expect(
        (
          await send('PATCH', `/api/streamer/posts/${post.id}`, cookieB, {
            reviewStatus: 'approved',
          })
        ).statusCode,
      ).toBe(404)
      expect((await send('POST', `/api/streamer/posts/${post.id}/air`, cookieB)).statusCode).toBe(
        404,
      )
      expect((await get('/api/streamer/inbox?status=bogus', cookieA)).statusCode).toBe(400)
    })

    it('approving appends to the queue and queue order updates are reflected', async () => {
      const { streamer, loginKey } = await createStreamer(ctx.app)
      const topic = await createInbox(ctx.app, streamer.id)
      const cookie = await loginStreamer(ctx.app, loginKey)
      const ids: string[] = []
      for (const title of ['一', '二', '三']) {
        ids.push((await postThread(ctx.app, topic.slug, { fields: { title } })).json().data.post.id)
      }
      for (const id of ids) {
        const res = await send('PATCH', `/api/streamer/posts/${id}`, cookie, {
          reviewStatus: 'approved',
        })
        expect(res.statusCode).toBe(200)
      }
      await send('PATCH', `/api/streamer/posts/${ids[0]}`, cookie, { queueOrder: 10 })
      const approved = (await get('/api/streamer/inbox?status=approved', cookie)).json().data
      expect(approved.map((i: { threadTitle: string }) => i.threadTitle)).toEqual([
        '二',
        '三',
        '一',
      ])
      expect(approved.map((i: { queueOrder: number }) => i.queueOrder)).toEqual([2, 3, 10])

      const rejected = await send('PATCH', `/api/streamer/posts/${ids[1]}`, cookie, {
        reviewStatus: 'rejected',
      })
      expect(rejected.json().data).toMatchObject({
        queueOrder: null,
        post: { reviewStatus: 'rejected' },
      })
      expect((await get('/api/streamer/me', cookie)).json().data.counts).toEqual({
        pending: 0,
        approved: 2,
        rejected: 1,
        aired: 0,
      })
      expect((await send('PATCH', `/api/streamer/posts/${ids[0]}`, cookie, {})).statusCode).toBe(
        400,
      )
    })

    it('air sets aired_at, notifies and makes post public with the aired badge', async () => {
      const { streamer, loginKey } = await createStreamer(ctx.app)
      const topic = await createInbox(ctx.app, streamer.id)
      const cookie = await loginStreamer(ctx.app, loginKey)
      const { post } = (await postThread(ctx.app, topic.slug)).json().data
      const res = await send('POST', `/api/streamer/posts/${post.id}/air`, cookie, {
        airedRef: 'https://www.youtube.com/watch?v=abc&t=120',
      })
      expect(res.json().data.post).toMatchObject({
        reviewStatus: 'aired',
        airedAt: '2026-09-18T12:00:00.000Z',
        airedRef: 'https://www.youtube.com/watch?v=abc&t=120',
      })
      expect(aired).toEqual([{ streamerId: streamer.id, postId: post.id }])
      const pub = await get(`/api/posts/${post.id}`)
      expect(pub.json().data).toMatchObject({
        reviewStatus: 'aired',
        airedRef: expect.stringContaining('youtube'),
      })
      expect((await get(`/api/topics/${topic.slug}/threads`)).json().data).toHaveLength(1)
      expect(
        (
          await send('POST', `/api/streamer/posts/${post.id}/air`, cookie, {
            airedRef: 'javascript:alert(1)',
          })
        ).statusCode,
      ).toBe(400)
    })

    it('requires a session for inbox reads', async () => {
      expect((await get('/api/streamer/inbox')).statusCode).toBe(401)
      expect((await get('/api/streamer/me', 'tv_streamer=garbage')).statusCode).toBe(401)
    })
  })
})
