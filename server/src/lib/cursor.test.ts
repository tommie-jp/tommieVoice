import { describe, expect, it } from 'vitest'
import { decodeCursor, encodeCursor } from './cursor.ts'

describe('cursor', () => {
  const c = { t: '2026-09-18T12:00:00.000Z', id: '0b3c9a34-6f0e-4f3b-9d8a-1f2e3d4c5b6a' }

  it('round-trips', () => {
    expect(decodeCursor(encodeCursor(c))).toEqual(c)
  })

  it('returns null for missing cursor', () => {
    expect(decodeCursor(undefined)).toBeNull()
    expect(decodeCursor('')).toBeNull()
  })

  it('throws bad_request for garbage', () => {
    expect(() => decodeCursor('not-base64-json')).toThrow('cursor')
    expect(() => decodeCursor(Buffer.from('{"t":1}').toString('base64url'))).toThrow('cursor')
  })
})
