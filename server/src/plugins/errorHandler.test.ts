import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AppError, rateLimited } from '../lib/errors.ts'
import { mapError } from './errorHandler.ts'

describe('mapError', () => {
  it('maps AppError to its status and code', () => {
    expect(mapError(new AppError(409, 'conflict', '重複'))).toEqual({
      status: 409,
      code: 'conflict',
      message: '重複',
      retryAfterSeconds: undefined,
    })
  })

  it('keeps retryAfterSeconds for rate limit errors', () => {
    expect(mapError(rateLimited(30)).retryAfterSeconds).toBe(30)
  })

  it('maps ZodError to 400 envelope naming the field', () => {
    const result = z.object({ title: z.string() }).safeParse({ title: 1 })
    const mapped = mapError(result.error)
    expect(mapped.status).toBe(400)
    expect(mapped.code).toBe('validation_error')
    expect(mapped.message).toContain('title')
  })

  it('maps fastify 413 errors', () => {
    const err = Object.assign(new Error('too large'), { statusCode: 413 })
    expect(mapError(err)).toMatchObject({ status: 413, code: 'payload_too_large' })
  })

  it('maps unknown 4xx fastify errors to bad_request keeping the status', () => {
    const err = Object.assign(new Error('x'), { statusCode: 422 })
    expect(mapError(err)).toMatchObject({ status: 422, code: 'bad_request' })
  })

  it('hides internal error message on 500', () => {
    const mapped = mapError(new Error('connection string postgres://user:pw@host'))
    expect(mapped.status).toBe(500)
    expect(mapped.message).not.toContain('postgres')
  })
})
