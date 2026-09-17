import { readStorage, writeStorage } from './storage'

// 投稿の削除トークンはこの端末にだけ保存する（サーバは一度しか返さない）
const KEY = 'tv.deleteTokens'
const MAX_ENTRIES = 500

type TokenMap = Readonly<Record<string, string>>

function load(): TokenMap {
  try {
    const parsed: unknown = JSON.parse(readStorage(KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? (parsed as TokenMap) : {}
  } catch {
    return {}
  }
}

export function saveDeleteToken(postId: string, token: string): void {
  const entries = Object.entries({ ...load(), [postId]: token }).slice(-MAX_ENTRIES)
  writeStorage(KEY, JSON.stringify(Object.fromEntries(entries)))
}

export function getDeleteToken(postId: string): string | null {
  return load()[postId] ?? null
}

export function forgetDeleteToken(postId: string): void {
  const next = Object.fromEntries(Object.entries(load()).filter(([id]) => id !== postId))
  writeStorage(KEY, JSON.stringify(next))
}

/** 新しい順に最大 limit 件 */
export function listDeleteTokens(limit = 50): { id: string; token: string }[] {
  return Object.entries(load())
    .reverse()
    .slice(0, limit)
    .map(([id, token]) => ({ id, token }))
}
