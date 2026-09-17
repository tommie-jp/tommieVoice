import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { Db } from '../../src/db/client.ts'
import { posts, threads, topics } from '../../src/db/schema/index.ts'
import { newId } from '../../src/lib/ids.ts'
import type { AudioStore } from '../../src/storage/audioStore.ts'
import { fixturePath } from './multipart.ts'

/** DB と原本ファイルに processing の投稿を 1 件作る */
export async function seedProcessingPost(
  db: Db,
  store: AudioStore,
  opts: {
    fixture?: string
    createdAt?: Date
    status?: 'processing' | 'ready' | 'failed' | 'hidden' | 'deleted'
  } = {},
) {
  const createdAt = opts.createdAt ?? new Date('2026-09-18T12:00:00Z')
  const topicId = newId()
  const threadId = newId()
  const id = newId()
  const fixture = opts.fixture ?? 'sample.webm'
  const ext = path.extname(fixture).slice(1)
  const originalPath = `2026/09/${id}.${ext}`
  await db.insert(topics).values({ id: topicId, slug: `t-${topicId.slice(0, 8)}`, title: 't' })
  await db
    .insert(threads)
    .values({ id: threadId, topicId, title: 't', postCount: 1, lastPostAt: createdAt })
  await db.insert(posts).values({
    id,
    threadId,
    seq: 1,
    deviceIdHash: 'd',
    ipHash: 'i',
    deleteTokenHash: 'x',
    originalPath,
    originalMime: 'audio/webm',
    durationMs: 1000,
    status: opts.status ?? 'processing',
    createdAt,
  })
  const target = store.absolute('original', originalPath)
  await mkdir(path.dirname(target), { recursive: true })
  await copyFile(fixturePath(fixture), target)
  return { id, threadId, originalPath }
}
