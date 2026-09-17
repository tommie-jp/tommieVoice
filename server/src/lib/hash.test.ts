import { describe, expect, it } from 'vitest'
import { hmacDeviceId, hmacIp, sha256Token, timingSafeEqualStr } from './hash.ts'

describe('hash helpers', () => {
  it('same input and key give same digest', () => {
    expect(hmacDeviceId('k1', 'd')).toBe(hmacDeviceId('k1', 'd'))
  })

  it('different key gives different digest', () => {
    expect(hmacIp('k1', '1.2.3.4')).not.toBe(hmacIp('k2', '1.2.3.4'))
  })

  it('device and ip namespaces do not collide for the same value', () => {
    expect(hmacDeviceId('k', 'x')).not.toBe(hmacIp('k', 'x'))
  })

  it('never contains the raw value', () => {
    expect(hmacIp('k', '203.0.113.9')).not.toContain('203.0.113.9')
    expect(sha256Token('tok')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('timingSafeEqualStr compares exactly', () => {
    expect(timingSafeEqualStr('abc', 'abc')).toBe(true)
    expect(timingSafeEqualStr('abc', 'abd')).toBe(false)
  })

  it('timingSafeEqualStr returns false for different length', () => {
    expect(timingSafeEqualStr('abc', 'abcd')).toBe(false)
    expect(timingSafeEqualStr('', 'a')).toBe(false)
  })
})
