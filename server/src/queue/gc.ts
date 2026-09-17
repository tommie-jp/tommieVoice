import { readdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { inArray, sql } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { posts } from '../db/schema/index.ts'
import type { AudioStore } from '../storage/audioStore.ts'

export const ORPHAN_MIN_AGE_MS = 7 * 24 * 3600 * 1000
export const TMP_MIN_AGE_MS = 24 * 3600 * 1000
const RELATIVE = /(\d{4}\/\d{2}\/[0-9a-f-]{36}\.(?:webm|m4a|ogg))$/

async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true })
    return entries.filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}

async function olderThan(file: string, now: number, ageMs: number): Promise<boolean> {
  const { mtimeMs } = await stat(file)
  return now - mtimeMs >= ageMs
}

async function referencedPaths(db: Db, column: 'original' | 'public', relatives: string[]) {
  if (relatives.length === 0) return new Set<string>()
  const col = column === 'original' ? posts.originalPath : posts.publicPath
  // 失敗・削除済みの投稿が参照しているファイルは消してよい
  const rows = await db
    .select({ p: col })
    .from(posts)
    .where(sql`${inArray(col, relatives)} AND ${posts.status} IN ('processing', 'ready', 'hidden')`)
  return new Set(rows.map((r) => r.p).filter((p): p is string => p !== null))
}

export type GcResult = { removed: number }

/** 参照されない古い音声ファイルと残った一時ファイルを消す */
export async function collectGarbage(db: Db, store: AudioStore, now: number): Promise<GcResult> {
  let removed = 0
  for (const area of ['original', 'public'] as const) {
    const files = await listFiles(path.join(store.root, area))
    const candidates: { file: string; rel: string }[] = []
    for (const file of files) {
      const rel = RELATIVE.exec(file)?.[1]
      if (rel && (await olderThan(file, now, ORPHAN_MIN_AGE_MS))) candidates.push({ file, rel })
    }
    const keep = await referencedPaths(
      db,
      area,
      candidates.map((c) => c.rel),
    )
    for (const c of candidates) {
      if (keep.has(c.rel)) continue
      await rm(c.file, { force: true })
      removed += 1
    }
  }
  for (const file of await listFiles(path.join(store.root, 'tmp'))) {
    if (await olderThan(file, now, TMP_MIN_AGE_MS)) {
      await rm(file, { force: true })
      removed += 1
    }
  }
  return { removed }
}
