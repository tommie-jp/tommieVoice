import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { RELAXED_RATE_LIMITS } from '../../../../shared/constants.ts'
import {
  adminHeaders,
  createInbox,
  createStreamer,
  CSRF,
  loginStreamer,
  postThread,
} from '../../../test/helpers/api.ts'
import { truncateAll } from '../../../test/helpers/db.ts'
import { createTestContext, type TestContext } from '../../../test/helpers/testApp.ts'

/** SSE を読み、条件を満たすイベントが来るまで待つ */
async function readEvents(
  body: ReadableStream<Uint8Array>,
  until: (events: { event: string; data: string }[]) => boolean,
  timeoutMs = 5_000,
) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const events: { event: string; data: string }[] = []
  let buffer = ''
  const deadline = Date.now() + timeoutMs
  while (!until(events)) {
    if (Date.now() > deadline) throw new Error(`timeout: ${JSON.stringify(events)} / ${buffer}`)
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const event =
        /^event: (.*)$/m.exec(block)?.[1] ?? (block.startsWith(':') ? 'comment' : 'other')
      const data = /^data: (.*)$/m.exec(block)?.[1] ?? block
      events.push({ event, data })
    }
  }
  reader.releaseLock()
  return events
}

describe('OBS overlay', () => {
  let ctx: TestContext
  let base: string

  beforeAll(async () => {
    ctx = await createTestContext({ limits: RELAXED_RATE_LIMITS, overlayPingMs: 50 })
    await ctx.app.listen({ host: '127.0.0.1', port: 0 })
    base = `http://127.0.0.1:${(ctx.app.server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    await ctx.close()
  })
  beforeEach(async () => {
    await truncateAll(ctx.handle.pool)
  })

  async function setup() {
    const { streamer, loginKey } = await createStreamer(ctx.app, 'とみー')
    const topic = await createInbox(ctx.app, streamer.id)
    const cookie = await loginStreamer(ctx.app, loginKey)
    const headers = { cookie, ...CSRF }
    const issued = await ctx.app.inject({
      method: 'POST',
      url: '/api/streamer/overlay-token',
      headers,
    })
    return {
      streamer,
      topic,
      cookie,
      headers,
      token: issued.json().data.token as string,
      path: issued.json().data.path as string,
    }
  }

  it('issues token once and stores hash', async () => {
    const { headers, token, path, cookie } = await setup()
    expect(path).toBe(`/overlay/${token}`)
    const { rows } = await ctx.handle.pool.query('SELECT overlay_token_hash FROM streamers')
    expect(rows[0].overlay_token_hash).toMatch(/^[0-9a-f]{64}$/)
    const status = await ctx.app.inject({
      method: 'GET',
      url: '/api/streamer/overlay-token',
      headers: { cookie },
    })
    expect(status.json().data).toEqual({ issued: true, connections: 0 })
    expect(status.body).not.toContain(token)
    expect(
      (
        await ctx.app.inject({
          method: 'POST',
          url: '/api/streamer/overlay-token',
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(403)
    void headers
  })

  it('rejects unknown token with 404 and reissue invalidates previous token', async () => {
    const { headers, token } = await setup()
    expect((await fetch(`${base}/api/overlay/${'z'.repeat(43)}/events`)).status).toBe(404)
    await ctx.app.inject({ method: 'POST', url: '/api/streamer/overlay-token', headers })
    expect((await fetch(`${base}/api/overlay/${token}/events`)).status).toBe(404)
  })

  it('sets text/event-stream and x-accel-buffering no, greets and pings', async () => {
    const { token } = await setup()
    const controller = new AbortController()
    const res = await fetch(`${base}/api/overlay/${token}/events`, { signal: controller.signal })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(res.headers.get('x-accel-buffering')).toBe('no')
    const events = await readEvents(res.body!, (e) => e.some((x) => x.event === 'comment'))
    expect(events.find((e) => e.event === 'hello')?.data).toBe(
      '{"type":"hello","streamerName":"とみー"}',
    )
    controller.abort()
  })

  it('air endpoint results in play event on the stream with subtitles', async () => {
    const { token, topic, headers, streamer } = await setup()
    const { post } = (
      await postThread(ctx.app, topic.slug, { fields: { authorName: 'ゆき', title: '質問' } })
    ).json().data
    const job = (
      await ctx.app.inject({
        method: 'POST',
        url: '/api/worker/jobs/claim',
        headers: { authorization: `Bearer ${process.env.WORKER_TOKEN}` },
        payload: { workerId: 'w' },
      })
    ).json().data
    await ctx.app.inject({
      method: 'POST',
      url: `/api/worker/jobs/${job.id}/result`,
      headers: {
        authorization: `Bearer ${process.env.WORKER_TOKEN}`,
        'x-lease-token': job.leaseToken,
      },
      payload: {
        engine: 'x',
        text: 'こんにちは',
        segments: [{ start: 0, end: 1, text: 'こんにちは' }],
      },
    })

    const controller = new AbortController()
    const res = await fetch(`${base}/api/overlay/${token}/events`, { signal: controller.signal })
    await readEvents(res.body!, (e) => e.some((x) => x.event === 'hello'))
    const status = await ctx.app.inject({
      method: 'GET',
      url: '/api/streamer/overlay-token',
      headers,
    })
    expect(status.json().data.connections).toBe(1)

    await ctx.app.inject({ method: 'POST', url: `/api/streamer/posts/${post.id}/air`, headers })
    const events = await readEvents(res.body!, (e) => e.some((x) => x.event === 'play'))
    const play = JSON.parse(events.find((e) => e.event === 'play')!.data)
    expect(play.post).toMatchObject({
      id: post.id,
      authorName: 'ゆき',
      title: '質問',
      audioUrl: expect.stringMatching(/^\/audio\/public\//),
      segments: [{ start: 0, end: 1, text: 'こんにちは' }],
    })

    const stop = await ctx.app.inject({
      method: 'POST',
      url: '/api/streamer/overlay/control',
      headers,
      payload: { action: 'stop' },
    })
    expect(stop.json().data).toEqual({ delivered: 1, postId: null })
    const after = await readEvents(res.body!, (e) => e.some((x) => x.event === 'stop'))
    expect(after.some((e) => e.event === 'stop')).toBe(true)
    controller.abort()
    void streamer
  })

  it('next airs the first approved post in queue order', async () => {
    const { topic, headers } = await setup()
    const first = (await postThread(ctx.app, topic.slug, { fields: { title: '一' } })).json().data
      .post
    const second = (await postThread(ctx.app, topic.slug, { fields: { title: '二' } })).json().data
      .post
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/streamer/posts/${first.id}`,
      headers,
      payload: { reviewStatus: 'approved', queueOrder: 5 },
    })
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/streamer/posts/${second.id}`,
      headers,
      payload: { reviewStatus: 'approved', queueOrder: 1 },
    })
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/streamer/overlay/control',
      headers,
      payload: { action: 'next' },
    })
    expect(res.json().data).toEqual({ delivered: 0, postId: second.id })
    const pub = await ctx.app.inject({ method: 'GET', url: `/api/posts/${second.id}` })
    expect(pub.json().data.reviewStatus).toBe('aired')
    await ctx.app.inject({
      method: 'POST',
      url: '/api/streamer/overlay/control',
      headers,
      payload: { action: 'next' },
    })
    const empty = await ctx.app.inject({
      method: 'POST',
      url: '/api/streamer/overlay/control',
      headers,
      payload: { action: 'next' },
    })
    expect(empty.statusCode).toBe(404)
  })

  it('disabled streamers lose the overlay', async () => {
    const { token, streamer } = await setup()
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/admin/streamers/${streamer.id}`,
      headers: adminHeaders(),
      payload: { disabled: true },
    })
    expect((await fetch(`${base}/api/overlay/${token}/events`)).status).toBe(404)
  })
})
