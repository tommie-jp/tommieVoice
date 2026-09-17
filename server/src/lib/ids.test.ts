import { describe, expect, it } from 'vitest'
import { newId, newToken } from './ids.ts'

describe('ids', () => {
  it('newId returns a v4 uuid', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('newToken is url-safe and unique', () => {
    const a = newToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(newToken()).not.toBe(a)
  })
})
