import { readFile } from 'node:fs/promises'

/** 全角半角・大文字小文字の違いを吸収する */
export function normalizeForMatch(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
}

export type NgWordChecker = { matches(text: string | null | undefined): boolean }

export function createNgWordChecker(words: readonly string[]): NgWordChecker {
  const normalized = words.map(normalizeForMatch).filter((w) => w.length > 0)
  return {
    matches(text) {
      if (!text || normalized.length === 0) return false
      const target = normalizeForMatch(text)
      return normalized.some((w) => target.includes(w))
    },
  }
}

/** 1 行 1 語。# で始まる行は注釈。ファイルが無ければ空 */
export async function loadNgWords(file: string | undefined): Promise<string[]> {
  if (!file) return []
  try {
    const body = await readFile(file, 'utf8')
    return body
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l !== '' && !l.startsWith('#'))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}
