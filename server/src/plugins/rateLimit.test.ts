import { afterEach, describe, expect, it } from 'vitest'
import { RATE_LIMITS } from '../../../shared/constants.ts'
import { createTopic, postThread } from '../../test/helpers/api.ts'
import { truncateAll } from '../../test/helpers/db.ts'
import { createTestContext, type TestContext } from '../../test/helpers/testApp.ts'

const DEVICE = '11111111-2222-4333-8444-555555555555'

describe('rate limits', () => {
  let ctx: TestContext | undefined
  afterEach(async () => {
    await ctx?.close()
    ctx = undefined
  })

  it('21st upload from same ip within 10 minutes gets 429', async () => {
    ctx = await createTestContext()
    await truncateAll(ctx.handle.pool)
    const { slug } = await createTopic(ctx.app)
    const statuses: number[] = []
    for (let i = 0; i < 21; i += 1) statuses.push((await postThread(ctx.app, slug)).statusCode)
    expect(statuses.slice(0, 20).every((s) => s === 201)).toBe(true)
    expect(statuses[20]).toBe(429)
  })

  it('429 body uses error envelope with retryAfter', async () => {
    ctx = await createTestContext({
      limits: { ...RATE_LIMITS, upload: { max: 1, windowMs: 600_000 } },
    })
    await truncateAll(ctx.handle.pool)
    const { slug } = await createTopic(ctx.app)
    await postThread(ctx.app, slug)
    const res = await postThread(ctx.app, slug)
    expect(res.statusCode).toBe(429)
    expect(res.headers['retry-after']).toBeDefined()
    expect(res.json()).toMatchObject({
      ok: false,
      error: { code: 'rate_limited', retryAfterSeconds: expect.any(Number) },
    })
  })

  it('6th upload from same device id gets 429 even with different ip', async () => {
    ctx = await createTestContext({
      limits: { ...RATE_LIMITS, global: { max: 1000, windowMs: 60_000 } },
    })
    await truncateAll(ctx.handle.pool)
    const { slug } = await createTopic(ctx.app)
    const statuses: number[] = []
    for (let i = 0; i < 6; i += 1) {
      const res = await postThread(ctx.app, slug, { deviceId: DEVICE, ip: `198.51.100.${i + 1}` })
      statuses.push(res.statusCode)
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429])
  })

  it('device window slides with the clock', async () => {
    ctx = await createTestContext({
      limits: { ...RATE_LIMITS, uploadPerDevice: { max: 1, windowMs: 600_000 } },
    })
    await truncateAll(ctx.handle.pool)
    const { slug } = await createTopic(ctx.app)
    await postThread(ctx.app, slug, { deviceId: DEVICE, ip: '198.51.100.1' })
    expect(
      (await postThread(ctx.app, slug, { deviceId: DEVICE, ip: '198.51.100.2' })).statusCode,
    ).toBe(429)
    ctx.clock.set('2026-09-18T12:11:00.000Z')
    expect(
      (await postThread(ctx.app, slug, { deviceId: DEVICE, ip: '198.51.100.3' })).statusCode,
    ).toBe(201)
  })

  it('health checks are never rate limited', async () => {
    ctx = await createTestContext({
      limits: { ...RATE_LIMITS, global: { max: 1, windowMs: 60_000 } },
    })
    const codes = []
    for (let i = 0; i < 3; i += 1) {
      codes.push((await ctx.app.inject({ method: 'GET', url: '/api/healthz' })).statusCode)
    }
    expect(codes).toEqual([200, 200, 200])
    await ctx.app.inject({ method: 'GET', url: '/api/topics' })
    expect((await ctx.app.inject({ method: 'GET', url: '/api/topics' })).statusCode).toBe(429)
  })
})
