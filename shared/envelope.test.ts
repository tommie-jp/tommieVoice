import { describe, expect, it } from 'vitest'
import { errorEnvelope, okEnvelope, parseEnvelope } from './envelope.ts'

describe('envelope', () => {
  it('ok envelope carries data and null error', () => {
    expect(okEnvelope({ a: 1 })).toEqual({ ok: true, data: { a: 1 }, error: null })
  })

  it('ok envelope includes meta only when given', () => {
    expect(okEnvelope([], { nextCursor: null })).toEqual({
      ok: true,
      data: [],
      error: null,
      meta: { nextCursor: null },
    })
  })

  it('error envelope requires code and message', () => {
    expect(() => errorEnvelope({ code: '', message: 'x' })).toThrow()
    expect(errorEnvelope({ code: 'not_found', message: '見つかりません' })).toEqual({
      ok: false,
      data: null,
      error: { code: 'not_found', message: '見つかりません' },
    })
  })

  it('parseEnvelope rejects a body without ok flag', () => {
    expect(() => parseEnvelope({ data: 1 })).toThrow()
  })

  it('parseEnvelope accepts an error body', () => {
    const parsed = parseEnvelope({ ok: false, data: null, error: { code: 'x', message: 'y' } })
    expect(parsed.ok).toBe(false)
  })
})
