import { describe, expect, it } from 'vitest'
import { APP_COMMIT_COUNTER, APP_DATE, APP_VERSION } from './appVersion.ts'

describe('appVersion constants', () => {
  it('APP_VERSION is X.Y.Z', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('APP_COMMIT_COUNTER is a positive integer string', () => {
    expect(APP_COMMIT_COUNTER).toMatch(/^\d+$/)
    expect(Number(APP_COMMIT_COUNTER)).toBeGreaterThan(0)
  })

  it('APP_DATE is YYYY-MM-DD', () => {
    expect(APP_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Number.isNaN(Date.parse(APP_DATE))).toBe(false)
  })
})
