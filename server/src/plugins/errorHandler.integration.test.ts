import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { rateLimited } from '../lib/errors.ts'
import { registerErrorHandling } from './errorHandler.ts'

async function appWith(route: () => never | Promise<never>) {
  const app = Fastify({ logger: false })
  registerErrorHandling(app)
  app.get('/boom', route)
  await app.ready()
  return app
}

describe('registerErrorHandling', () => {
  it('sends retry-after header and body field for rate limit errors', async () => {
    const app = await appWith(() => {
      throw rateLimited(42)
    })
    const res = await app.inject({ method: 'GET', url: '/boom' })
    expect(res.statusCode).toBe(429)
    expect(res.headers['retry-after']).toBe('42')
    expect(res.json()).toEqual({
      ok: false,
      data: null,
      error: { code: 'rate_limited', message: expect.any(String), retryAfterSeconds: 42 },
    })
    await app.close()
  })

  it('returns a validation envelope for zod errors', async () => {
    const app = await appWith(() => {
      z.object({ n: z.number() }).parse({ n: 'x' })
      throw new Error('unreachable')
    })
    const res = await app.inject({ method: 'GET', url: '/boom' })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('validation_error')
    await app.close()
  })

  it('returns 500 without leaking the message', async () => {
    const app = await appWith(async () => {
      throw new Error('db password is hunter2')
    })
    const res = await app.inject({ method: 'GET', url: '/boom' })
    expect(res.statusCode).toBe(500)
    expect(res.body).not.toContain('hunter2')
    await app.close()
  })
})
