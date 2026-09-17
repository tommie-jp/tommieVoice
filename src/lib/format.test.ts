import { formatDuration, formatRelative } from './format'

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [1499, '0:01'],
    [65_000, '1:05'],
    [90_000, '1:30'],
  ])('%i ms → %s', (ms, text) => {
    expect(formatDuration(ms)).toBe(text)
  })

  it('shows a placeholder for unknown values', () => {
    expect(formatDuration(null)).toBe('-:--')
    expect(formatDuration(Number.NaN)).toBe('-:--')
    expect(formatDuration(-1)).toBe('-:--')
  })
})

describe('formatRelative', () => {
  const now = Date.parse('2026-09-18T12:00:00Z')
  it.each([
    ['2026-09-18T11:59:30Z', 'たった今'],
    ['2026-09-18T11:57:00Z', '3分前'],
    ['2026-09-18T10:00:00Z', '2時間前'],
    ['2026-09-16T12:00:00Z', '2日前'],
  ])('%s → %s', (iso, text) => {
    expect(formatRelative(iso, now)).toBe(text)
  })

  it('shows month/day for older posts', () => {
    expect(formatRelative('2026-08-01T12:00:00Z', now)).toMatch(/^8\/1$/)
  })

  it('returns empty text for invalid dates', () => {
    expect(formatRelative('nope', now)).toBe('')
  })
})
