import { segmentAt } from './subtitleSync'

const segments = [
  { start: 0, end: 1.5, text: 'こんにちは' },
  { start: 2, end: 3, text: '質問です' },
  { start: 3, end: 5, text: 'よろしく' },
]

describe('segmentAt', () => {
  it('returns segment containing time', () => {
    expect(segmentAt(segments, 0.7)?.text).toBe('こんにちは')
    expect(segmentAt(segments, 2)?.text).toBe('質問です')
    expect(segmentAt(segments, 4.9)?.text).toBe('よろしく')
  })

  it('returns null between segments, outside the range and for empty lists', () => {
    expect(segmentAt(segments, 1.8)).toBeNull()
    expect(segmentAt(segments, 9)).toBeNull()
    expect(segmentAt([], 1)).toBeNull()
  })
})
