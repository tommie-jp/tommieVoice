import { describe, expect, it } from 'vitest'
import { fixedClock, systemClock } from './clock.ts'

describe('clock', () => {
  it('systemClock returns the current time', () => {
    const before = Date.now()
    const now = systemClock.now().getTime()
    expect(now).toBeGreaterThanOrEqual(before)
  })

  it('fixedClock returns a copy that callers cannot mutate', () => {
    const clock = fixedClock('2026-09-18T00:00:00Z')
    const a = clock.now()
    a.setFullYear(2000)
    expect(clock.now().toISOString()).toBe('2026-09-18T00:00:00.000Z')
  })

  it('fixedClock can be moved with set', () => {
    const clock = fixedClock('2026-09-18T00:00:00Z')
    clock.set('2026-09-18T00:10:00Z')
    expect(clock.now().toISOString()).toBe('2026-09-18T00:10:00.000Z')
  })
})
