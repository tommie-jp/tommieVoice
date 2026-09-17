import { describe, expect, it } from 'vitest'
import { createNgWordChecker } from './ngWords.ts'
import { triage } from './triage.ts'

const ngWords = createNgWordChecker(['死ね'])
const run = (text: string, hasScript = false) => triage(text, { hasScript, ngWords })

describe('triage', () => {
  it('flags text containing ng word', () => {
    expect(run('お前なんか死ねって言われた').riskFlags).toContain('ng_word')
  })

  it('tags question when text ends with question mark', () => {
    expect(run('配信の機材は何を使っていますか？').tags).toEqual(['question'])
  })

  it('tags requests, greetings and script answers', () => {
    expect(run('こんばんは、この台詞を読んでください', true).tags).toEqual([
      'script',
      'request',
      'greeting',
    ])
  })

  it('summary is at most 60 chars and collapses whitespace', () => {
    const long = `${'あ'.repeat(70)}`
    const result = run(long)
    expect([...result.summary]).toHaveLength(60)
    expect(result.summary.endsWith('…')).toBe(true)
    expect(run('  改行\n  入り  ').summary).toBe('改行 入り')
  })

  it('flags contact information and empty text', () => {
    expect(run('連絡は 090-1234-5678 まで').riskFlags).toEqual(['contact_info'])
    expect(run('mail me: a.b@example.com').riskFlags).toEqual(['contact_info'])
    expect(run('https://example.com 見て').riskFlags).toEqual(['contact_info'])
    expect(run('LINE ID 教えます').riskFlags).toContain('contact_info')
    expect(run(' ').riskFlags).toEqual(['empty'])
  })
})
