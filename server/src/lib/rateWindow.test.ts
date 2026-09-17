import { describe, expect, it } from 'vitest'
import { createRateWindow } from './rateWindow.ts'

describe('createRateWindow', () => {
  it('allows up to max hits in a window and then reports retry seconds', () => {
    const w = createRateWindow(2, 60_000)
    expect(w.hit('a', 0)).toBe(0)
    expect(w.hit('a', 1_000)).toBe(0)
    expect(w.hit('a', 2_000)).toBe(58)
  })

  it('tracks keys independently', () => {
    const w = createRateWindow(1, 60_000)
    expect(w.hit('a', 0)).toBe(0)
    expect(w.hit('b', 0)).toBe(0)
  })

  it('starts a new window after expiry', () => {
    const w = createRateWindow(1, 1_000)
    w.hit('a', 0)
    expect(w.hit('a', 500)).toBe(1)
    expect(w.hit('a', 1_000)).toBe(0)
  })

  it('reset clears a key', () => {
    const w = createRateWindow(1, 60_000)
    w.hit('a', 0)
    w.reset('a')
    expect(w.hit('a', 1)).toBe(0)
  })

  it('sweeps expired buckets periodically without losing live ones', () => {
    const w = createRateWindow(1, 10)
    for (let i = 0; i < 499; i += 1) w.hit(`k${i}`, 0)
    w.hit('live', 100)
    expect(w.hit('live', 105)).toBe(1)
  })
})
