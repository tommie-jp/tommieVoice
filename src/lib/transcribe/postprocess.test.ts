import { cleanTranscript, dropRepeats, toSegments } from './postprocess'

const seg = (start: number, end: number, text: string) => ({ start, end, text })

describe('toSegments', () => {
  it('fills missing end timestamp with the next start or the duration', () => {
    const out = toSegments(
      {
        text: 'a b',
        chunks: [
          { timestamp: [0, null], text: ' こんにちは ' },
          { timestamp: [2, null], text: '質問です' },
        ],
      },
      5,
    )
    expect(out).toEqual([seg(0, 2, 'こんにちは'), seg(2, 5, '質問です')])
  })

  it('keeps segments sorted and clamps to the duration', () => {
    const out = toSegments(
      {
        text: '',
        chunks: [
          { timestamp: [3, 99], text: '後' },
          { timestamp: [-1, 1], text: '前' },
        ],
      },
      4,
    )
    expect(out).toEqual([seg(0, 1, '前'), seg(3, 4, '後')])
  })

  it('uses the whole text when there are no chunks and drops known hallucinations', () => {
    expect(toSegments({ text: '  全文  ' }, 2)).toEqual([seg(0, 2, '全文')])
    expect(toSegments({ text: 'ご視聴ありがとうございました' }, 2)).toEqual([])
  })
})

describe('dropRepeats', () => {
  it('drops a sentence repeated three times in a row', () => {
    const out = dropRepeats([
      seg(0, 1, 'a'),
      seg(1, 2, 'x'),
      seg(2, 3, 'x'),
      seg(3, 4, 'x'),
      seg(4, 5, 'x'),
      seg(5, 6, 'b'),
    ])
    expect(out).toEqual([seg(0, 1, 'a'), seg(1, 5, 'x'), seg(5, 6, 'b')])
  })

  it('keeps a sentence said twice', () => {
    const input = [seg(0, 1, 'x'), seg(1, 2, 'x'), seg(2, 3, 'y')]
    expect(dropRepeats(input)).toEqual(input)
  })
})

describe('cleanTranscript', () => {
  it('joins cleaned segments', () => {
    const out = cleanTranscript(
      {
        text: '',
        chunks: [
          { timestamp: [0, 1], text: 'はじめまして' },
          { timestamp: [1, 2], text: '  ' },
          { timestamp: [2, 3], text: 'よろしく' },
        ],
      },
      3,
    )
    expect(out).toEqual({
      text: 'はじめまして よろしく',
      segments: [seg(0, 1, 'はじめまして'), seg(2, 3, 'よろしく')],
    })
  })
})
