import type { TranscriptSegment } from '../../../shared/schemas/transcript.ts'

/** 再生位置 t（秒）に表示する字幕。区間の間は null */
export function segmentAt(
  segments: readonly TranscriptSegment[],
  t: number,
): TranscriptSegment | null {
  let lo = 0
  let hi = segments.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const s = segments[mid]!
    if (t < s.start) hi = mid - 1
    else if (t > s.end) lo = mid + 1
    else return s
  }
  return null
}
