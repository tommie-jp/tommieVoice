import { afterEach, describe, expect, it } from 'vitest'
import { APP_VERSION } from '../../../../shared/appVersion.ts'
import { createTestContext, type TestContext } from '../../../test/helpers/testApp.ts'

describe('GET /api/healthz', () => {
  let ctx: TestContext | undefined

  afterEach(async () => {
    await ctx?.close()
    ctx = undefined
  })

  it('returns ok envelope with version when the database answers', async () => {
    ctx = await createTestContext()
    const res = await ctx.app.inject({ method: 'GET', url: '/api/healthz' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      ok: true,
      data: { status: 'ok', version: APP_VERSION },
    })
  })

  it('returns 503 when the database ping fails', async () => {
    ctx = await createTestContext({
      pingDb: () => Promise.reject(new Error('down')),
    })
    const res = await ctx.app.inject({ method: 'GET', url: '/api/healthz' })
    expect(res.statusCode).toBe(503)
    expect(res.json()).toMatchObject({ ok: false, error: { code: 'service_unavailable' } })
  })

  it('returns a not_found envelope for unknown routes', async () => {
    ctx = await createTestContext()
    const res = await ctx.app.inject({ method: 'GET', url: '/api/nope' })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({
      ok: false,
      data: null,
      error: { code: 'not_found', message: '見つかりません' },
    })
  })
})
