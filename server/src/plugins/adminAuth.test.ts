import { afterEach, describe, expect, it } from 'vitest'
import { createTestContext, type TestContext } from '../../test/helpers/testApp.ts'

const body = { slug: 'x-topic', title: 't' }

describe('admin guard', () => {
  let ctx: TestContext | undefined
  afterEach(async () => {
    await ctx?.close()
    ctx = undefined
  })

  it('rejects missing header with 401', async () => {
    ctx = await createTestContext()
    const res = await ctx.app.inject({ method: 'POST', url: '/api/admin/topics', payload: body })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('unauthorized')
  })

  it('rejects wrong token with 401 and no token echo', async () => {
    ctx = await createTestContext()
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/topics',
      headers: { authorization: 'Bearer wrong-token-value' },
      payload: body,
    })
    expect(res.statusCode).toBe(401)
    expect(res.body).not.toContain('wrong-token-value')
    expect(res.body).not.toContain(process.env.ADMIN_TOKEN!)
  })

  it('rejects non-bearer schemes', async () => {
    ctx = await createTestContext()
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/topics',
      headers: { authorization: `Basic ${process.env.ADMIN_TOKEN}` },
      payload: body,
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 429 after repeated failures from the same ip', async () => {
    ctx = await createTestContext()
    const statuses: number[] = []
    for (let i = 0; i < 7; i += 1) {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/admin/topics',
        headers: { authorization: 'Bearer nope' },
        payload: body,
      })
      statuses.push(res.statusCode)
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401])
    expect(statuses.at(-1)).toBe(429)
  })

  it('accepts valid token', async () => {
    ctx = await createTestContext()
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/topics',
      headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}` },
      payload: { slug: `ok-${Date.now()}`, title: 't' },
    })
    expect(res.statusCode).toBe(201)
  })
})
