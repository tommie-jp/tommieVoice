import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { RELAXED_RATE_LIMITS } from '../../../../shared/constants.ts'
import {
  createInbox,
  createStreamer,
  createTopic,
  CSRF,
  loginStreamer,
  postThread,
} from '../../../test/helpers/api.ts'
import { truncateAll } from '../../../test/helpers/db.ts'
import { createTestContext, type TestContext } from '../../../test/helpers/testApp.ts'

const WORKER = () => ({ authorization: `Bearer ${process.env.WORKER_TOKEN}` })

describe('worker job API', () => {
  let ctx: TestContext
  beforeAll(async () => {
    ctx = await createTestContext({ limits: RELAXED_RATE_LIMITS, ngWords: ['死ね'] })
  })
  afterAll(async () => {
    await ctx.close()
  })
  beforeEach(async () => {
    await truncateAll(ctx.handle.pool)
  })

  const claim = (headers: Record<string, string>, workerId = 'gpu-1') =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/worker/jobs/claim',
      headers,
      payload: { workerId },
    })
  const withLease = (
    method: 'GET' | 'POST',
    url: string,
    headers: Record<string, string>,
    lease: string,
    payload?: object,
  ) =>
    ctx.app.inject({
      method,
      url,
      headers: { ...headers, 'x-lease-token': lease },
      ...(payload ? { payload } : {}),
    })

  async function inboxWithPost(title = '凸') {
    const { streamer, loginKey } = await createStreamer(ctx.app)
    const topic = await createInbox(ctx.app, streamer.id, { scriptText: '台本' })
    const { post } = (await postThread(ctx.app, topic.slug, { fields: { title } })).json().data
    return { streamer, loginKey, topic, post }
  }

  it('claim returns 204 when queue empty and rejects bad credentials', async () => {
    expect((await claim(WORKER())).statusCode).toBe(204)
    expect((await claim({ authorization: 'Bearer wrong' })).statusCode).toBe(401)
    expect((await claim({})).statusCode).toBe(403)
    expect((await claim(CSRF)).statusCode).toBe(401)
  })

  it('only transcribe-enabled topics create jobs', async () => {
    const board = await createTopic(ctx.app)
    await postThread(ctx.app, board.slug)
    expect((await claim(WORKER())).statusCode).toBe(204)
  })

  it('claim leases job for 15 minutes and second claim gets a different job', async () => {
    await inboxWithPost('一')
    await inboxWithPost('二')
    const first = (await claim(WORKER())).json().data
    expect(first.leaseUntil).toBe('2026-09-18T12:15:00.000Z')
    expect(first.audioPath).toBe(`/api/worker/jobs/${first.id}/audio`)
    const second = (await claim(WORKER(), 'gpu-2')).json().data
    expect(second.id).not.toBe(first.id)
    expect((await claim(WORKER())).statusCode).toBe(204)
  })

  it('expired lease is re-claimable', async () => {
    await inboxWithPost()
    const first = (await claim(WORKER())).json().data
    ctx.clock.set('2026-09-18T12:16:00.000Z')
    const again = (await claim(WORKER(), 'gpu-2')).json().data
    expect(again.id).toBe(first.id)
    expect((await withLease('GET', first.audioPath, WORKER(), first.leaseToken)).statusCode).toBe(
      403,
    )
    ctx.clock.set('2026-09-18T12:00:00.000Z')
  })

  it('audio endpoint rejects worker that does not hold the lease', async () => {
    await inboxWithPost()
    const job = (await claim(WORKER())).json().data
    const ok = await withLease('GET', job.audioPath, WORKER(), job.leaseToken)
    expect(ok.statusCode).toBe(200)
    expect(ok.headers['content-type']).toBe('audio/mp4')
    expect(ok.rawPayload.length).toBeGreaterThan(100)
    expect((await withLease('GET', job.audioPath, WORKER(), 'x'.repeat(43))).statusCode).toBe(403)
    expect((await withLease('GET', job.audioPath, WORKER(), 'short')).statusCode).toBe(403)
  })

  it('streamer session can only claim jobs of owned topics', async () => {
    const mine = await inboxWithPost('自分')
    const other = await inboxWithPost('他人')
    const cookie = await loginStreamer(ctx.app, mine.loginKey)
    const headers = { cookie, ...CSRF }
    const job = (await claim(headers, 'browser')).json().data
    expect(job.postId).toBe(mine.post.id)
    expect((await claim(headers, 'browser')).statusCode).toBe(204)
    const otherJob = (await claim(WORKER())).json().data
    expect(otherJob.postId).toBe(other.post.id)
    expect(
      (await withLease('GET', otherJob.audioPath, headers, otherJob.leaseToken)).statusCode,
    ).toBe(403)
  })

  it('result stores transcript with triage and marks job done', async () => {
    const { post, loginKey } = await inboxWithPost()
    const job = (await claim(WORKER())).json().data
    const res = await withLease(
      'POST',
      `/api/worker/jobs/${job.id}/result`,
      WORKER(),
      job.leaseToken,
      {
        engine: 'transformers.js',
        model: 'whisper-large-v3-turbo',
        language: 'ja',
        text: 'こんばんは、この台詞を読んでもいいですか？ 死ね',
        segments: [{ start: 0, end: 1.5, text: 'こんばんは' }],
      },
    )
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({
      tags: ['script', 'question', 'request', 'greeting'],
      riskFlags: ['ng_word'],
    })
    const cookie = await loginStreamer(ctx.app, loginKey)
    const [item] = (
      await ctx.app.inject({ method: 'GET', url: '/api/streamer/inbox', headers: { cookie } })
    ).json().data
    expect(item).toMatchObject({
      transcriptState: 'done',
      transcript: { summary: expect.stringContaining('こんばんは') },
    })
    expect(item.post.id).toBe(post.id)
    expect(
      (
        await withLease('POST', `/api/worker/jobs/${job.id}/result`, WORKER(), job.leaseToken, {
          engine: 'x',
          text: 'y',
        })
      ).statusCode,
    ).toBe(403)
  })

  it('accepts a maximum-size transcript', async () => {
    await inboxWithPost()
    const job = (await claim(WORKER())).json().data
    const segments = Array.from({ length: 2000 }, (_, i) => ({
      start: i,
      end: i + 0.5,
      text: 'あ'.repeat(10),
    }))
    const res = await withLease(
      'POST',
      `/api/worker/jobs/${job.id}/result`,
      WORKER(),
      job.leaseToken,
      {
        engine: 'x',
        text: 'あ'.repeat(20_000),
        segments,
      },
    )
    expect(res.statusCode).toBe(200)
  })

  it('result rejects segments with end before start', async () => {
    await inboxWithPost()
    const job = (await claim(WORKER())).json().data
    const res = await withLease(
      'POST',
      `/api/worker/jobs/${job.id}/result`,
      WORKER(),
      job.leaseToken,
      {
        engine: 'x',
        text: 'y',
        segments: [{ start: 2, end: 1, text: 'z' }],
      },
    )
    expect(res.statusCode).toBe(400)
  })

  it('third fail marks job failed and post stays ready', async () => {
    const { post } = await inboxWithPost()
    const statuses: string[] = []
    for (let i = 0; i < 3; i += 1) {
      const job = (await claim(WORKER())).json().data
      const res = await withLease(
        'POST',
        `/api/worker/jobs/${job.id}/fail`,
        WORKER(),
        job.leaseToken,
        { error: 'webgpu lost' },
      )
      statuses.push(res.json().data.status)
    }
    expect(statuses).toEqual(['queued', 'queued', 'failed'])
    expect((await claim(WORKER())).statusCode).toBe(204)
    expect((await ctx.app.inject({ method: 'GET', url: `/api/posts/${post.id}` })).statusCode).toBe(
      404,
    )
    const { rows } = await ctx.handle.pool.query('SELECT status FROM posts')
    expect(rows[0].status).toBe('ready')
  })

  it('reports queue status and last worker contact', async () => {
    const { loginKey } = await inboxWithPost()
    await inboxWithPost()
    const cookie = await loginStreamer(ctx.app, loginKey)
    const before = (
      await ctx.app.inject({
        method: 'GET',
        url: '/api/streamer/transcription-status',
        headers: { cookie },
      })
    ).json().data
    expect(before).toEqual({ waiting: 1, leased: 0, failed: 0, lastWorkerSeenAt: null })
    await claim(WORKER())
    const after = (
      await ctx.app.inject({ method: 'GET', url: '/api/worker/status', headers: WORKER() })
    ).json().data
    expect(after).toMatchObject({
      waiting: 1,
      leased: 1,
      lastWorkerSeenAt: '2026-09-18T12:00:00.000Z',
    })
    const mine = (
      await ctx.app.inject({
        method: 'GET',
        url: '/api/streamer/transcription-status',
        headers: { cookie },
      })
    ).json().data
    expect(mine.lastWorkerSeenAt).toBe('2026-09-18T12:00:00.000Z')
  })
})

describe('public transcript', () => {
  it('returns transcript for visible post and 404 for pending inbox post', async () => {
    const ctx = await createTestContext({ limits: RELAXED_RATE_LIMITS })
    try {
      await truncateAll(ctx.handle.pool)
      const { streamer, loginKey } = await createStreamer(ctx.app)
      const topic = await createInbox(ctx.app, streamer.id)
      const { post } = (await postThread(ctx.app, topic.slug)).json().data
      const job = (
        await ctx.app.inject({
          method: 'POST',
          url: '/api/worker/jobs/claim',
          headers: WORKER(),
          payload: { workerId: 'w' },
        })
      ).json().data
      await ctx.app.inject({
        method: 'POST',
        url: `/api/worker/jobs/${job.id}/result`,
        headers: { ...WORKER(), 'x-lease-token': job.leaseToken },
        payload: { engine: 'x', text: '公開される文字起こし' },
      })
      expect(
        (await ctx.app.inject({ method: 'GET', url: `/api/posts/${post.id}/transcript` }))
          .statusCode,
      ).toBe(404)
      const cookie = await loginStreamer(ctx.app, loginKey)
      await ctx.app.inject({
        method: 'POST',
        url: `/api/streamer/posts/${post.id}/air`,
        headers: { cookie, ...CSRF },
      })
      const res = await ctx.app.inject({ method: 'GET', url: `/api/posts/${post.id}/transcript` })
      expect(res.json().data).toMatchObject({
        text: '公開される文字起こし',
        summary: '公開される文字起こし',
      })
      const board = await createTopic(ctx.app)
      const plain = (await postThread(ctx.app, board.slug)).json().data.post
      expect(
        (await ctx.app.inject({ method: 'GET', url: `/api/posts/${plain.id}/transcript` }))
          .statusCode,
      ).toBe(404)
    } finally {
      await ctx.close()
    }
  })
})
