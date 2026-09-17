import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNgWordChecker, loadNgWords, normalizeForMatch } from './ngWords.ts'

describe('ng words', () => {
  it('rejects title containing listed word', () => {
    const checker = createNgWordChecker(['宣伝'])
    expect(checker.matches('これは宣伝です')).toBe(true)
    expect(checker.matches('普通の投稿')).toBe(false)
    expect(checker.matches(null)).toBe(false)
  })

  it('is case and width insensitive and ignores spaces', () => {
    const checker = createNgWordChecker(['spam'])
    expect(checker.matches('ＳＰＡＭ')).toBe(true)
    expect(checker.matches('S p A m')).toBe(true)
    expect(normalizeForMatch('ｱｲｳ')).toBe('アイウ')
  })

  it('never matches with an empty list or blank entries', () => {
    expect(createNgWordChecker([]).matches('anything')).toBe(false)
    expect(createNgWordChecker(['  ']).matches('anything')).toBe(false)
  })

  it('loads words from a file, skipping comments and blanks', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ng-'))
    const file = path.join(dir, 'ng.txt')
    await writeFile(file, '# comment\n宣伝\r\n\n  spam  \n')
    expect(await loadNgWords(file)).toEqual(['宣伝', 'spam'])
    expect(await loadNgWords(path.join(dir, 'missing.txt'))).toEqual([])
    expect(await loadNgWords(undefined)).toEqual([])
    await expect(loadNgWords(dir)).rejects.toThrow()
    await rm(dir, { recursive: true, force: true })
  })
})
