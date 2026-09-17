import { describe, expect, it } from 'vitest'
import {
  AppError,
  badRequest,
  conflict,
  forbidden,
  notFound,
  payloadTooLarge,
  rateLimited,
  unauthorized,
  unsupportedMedia,
} from './errors.ts'

describe('error factories', () => {
  it.each([
    [badRequest('x'), 400, 'bad_request'],
    [unauthorized(), 401, 'unauthorized'],
    [forbidden(), 403, 'forbidden'],
    [notFound(), 404, 'not_found'],
    [conflict('x'), 409, 'conflict'],
    [payloadTooLarge(), 413, 'payload_too_large'],
    [unsupportedMedia(), 415, 'unsupported_media_type'],
    [rateLimited(5), 429, 'rate_limited'],
  ] as const)('%o has status %i and code %s', (err, status, code) => {
    expect(err).toBeInstanceOf(AppError)
    expect(err.statusCode).toBe(status)
    expect(err.code).toBe(code)
    expect(err.message.length).toBeGreaterThan(0)
  })
})
