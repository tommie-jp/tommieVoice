import { describe, expect, it } from 'vitest'
import type { StreamerRow } from '../db/schema/index.ts'
import { issueSessionValue, parseSessionValue, SESSION_TTL_MS } from './streamerAuth.ts'

const KEY = 'k'.repeat(40)
const streamer = { id: '0b3c9a34-6f0e-4f3b-9d8a-1f2e3d4c5b6a', sessionVersion: 3 } as StreamerRow
const now = new Date('2026-09-18T12:00:00Z')

describe('session values', () => {
  it('round-trips a signed value', () => {
    const value = issueSessionValue(KEY, streamer, now)
    expect(parseSessionValue(KEY, value, now)).toEqual({
      streamerId: streamer.id,
      version: 3,
      issuedAt: now.getTime(),
    })
  })

  it('rejects tampered, foreign-key and malformed values', () => {
    const value = issueSessionValue(KEY, streamer, now)
    const tampered = value.replace('.3.', '.4.')
    expect(parseSessionValue(KEY, tampered, now)).toBeNull()
    expect(parseSessionValue('x'.repeat(40), value, now)).toBeNull()
    expect(parseSessionValue(KEY, 'a.b.c', now)).toBeNull()
    expect(parseSessionValue(KEY, undefined, now)).toBeNull()
  })

  it('expires after the ttl', () => {
    const value = issueSessionValue(KEY, streamer, now)
    const later = new Date(now.getTime() + SESSION_TTL_MS + 1)
    expect(parseSessionValue(KEY, value, later)).toBeNull()
  })
})
