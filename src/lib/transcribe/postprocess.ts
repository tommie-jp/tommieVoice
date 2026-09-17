import type { TranscriptSegment } from '../../../shared/schemas/transcript.ts'
import type { CleanTranscript, RawOutput } from './types'

/** Whisper が無音や雑音に対して出しがちな定型文（それだけの区間は捨てる） */
const HALLUCINATIONS = [
  'ご視聴ありがとうございました',
  'ご視聴ありがとうございました。',
  'チャンネル登録よろしくお願いします',
  'チャンネル登録お願いします',
  'おやすみなさい',
]
const REPEAT_LIMIT = 3

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function toSegments(output: RawOutput, durationSec: number): TranscriptSegment[] {
  const chunks = output.chunks ?? [
    { timestamp: [0, durationSec] as [number, number], text: output.text },
  ]
  const segments = chunks
    .map((c, i) => {
      const start = Math.max(0, c.timestamp[0])
      const nextStart = chunks[i + 1]?.timestamp[0]
      const rawEnd = c.timestamp[1] ?? nextStart ?? durationSec
      const end = Math.max(start, Math.min(rawEnd, Math.max(durationSec, start)))
      return { start, end, text: normalize(c.text) }
    })
    .filter((s) => s.text !== '' && !HALLUCINATIONS.includes(s.text))
  return [...segments].sort((a, b) => a.start - b.start)
}

/** 同じ文が 3 回以上続いたら 1 回に畳む（Whisper の繰り返し幻覚対策） */
export function dropRepeats(segments: readonly TranscriptSegment[]): TranscriptSegment[] {
  const result: TranscriptSegment[] = []
  let run = 0
  for (const s of segments) {
    const prev = result.at(-1)
    run = prev && prev.text === s.text ? run + 1 : 1
    if (run === 1) {
      result.push(s)
    } else if (run < REPEAT_LIMIT) {
      result.push(s)
    } else if (run === REPEAT_LIMIT) {
      // 3 回目で「繰り返し」と判断し、2 回目までに追加した重複も取り除く
      result.splice(result.length - (REPEAT_LIMIT - 2), REPEAT_LIMIT - 2)
      const first = result.at(-1)!
      result[result.length - 1] = { ...first, end: s.end }
    } else {
      const first = result.at(-1)!
      result[result.length - 1] = { ...first, end: s.end }
    }
  }
  return result
}

export function cleanTranscript(output: RawOutput, durationSec: number): CleanTranscript {
  const segments = dropRepeats(toSegments(output, durationSec))
  const text = segments.map((s) => s.text).join(' ')
  return { text, segments }
}
