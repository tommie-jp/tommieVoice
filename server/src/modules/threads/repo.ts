import { and, desc, eq, lt, or, sql } from 'drizzle-orm'
import type { ThreadSummary } from '../../../../shared/schemas/thread.ts'
import type { Db } from '../../db/client.ts'
import { posts, threads, topics, type ThreadRow, type TopicRow } from '../../db/schema/index.ts'
import type { Cursor } from '../../lib/cursor.ts'
import { publicPostCondition } from '../posts/visibility.ts'
import type { NewPost } from '../posts/repo.ts'

// 相関サブクエリは列名が曖昧にならないよう別名と完全修飾名で書く
const visiblePostCount = sql<number>`(
  SELECT count(*)::int FROM posts AS vp
  JOIN threads AS vt ON vt.id = vp.thread_id
  JOIN topics AS vtt ON vtt.id = vt.topic_id
  WHERE vp.thread_id = "threads"."id" AND ${publicPostCondition('vp', 'vtt')}
)`

function toSummary(row: ThreadRow, topicSlug: string, postCount: number): ThreadSummary {
  return {
    id: row.id,
    topicId: row.topicId,
    topicSlug,
    title: row.title,
    postCount,
    lastPostAt: row.lastPostAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }
}

const hasVisiblePost = sql`EXISTS (
  SELECT 1 FROM posts AS hp WHERE hp.thread_id = "threads"."id"
    AND ${publicPostCondition('hp', '"topics"')}
)`

export async function listThreads(
  db: Db,
  topic: TopicRow,
  cursor: Cursor | null,
  limit: number,
): Promise<{ items: ThreadSummary[]; next: Cursor | null }> {
  const after = cursor
    ? or(
        lt(threads.lastPostAt, new Date(cursor.t)),
        and(eq(threads.lastPostAt, new Date(cursor.t)), lt(threads.id, cursor.id)),
      )
    : undefined
  const rows = await db
    .select({ thread: threads, postCount: visiblePostCount })
    .from(threads)
    .innerJoin(topics, eq(topics.id, threads.topicId))
    .where(and(eq(threads.topicId, topic.id), hasVisiblePost, after))
    .orderBy(desc(threads.lastPostAt), desc(threads.id))
    .limit(limit + 1)
  const page = rows.slice(0, limit)
  const last = page.at(-1)
  const next =
    rows.length > limit && last
      ? { t: last.thread.lastPostAt.toISOString(), id: last.thread.id }
      : null
  return { items: page.map((r) => toSummary(r.thread, topic.slug, r.postCount)), next }
}

export type ThreadWithTopic = { thread: ThreadRow; topic: TopicRow; postCount: number }

export async function findThread(db: Db, id: string): Promise<ThreadWithTopic | null> {
  const [row] = await db
    .select({ thread: threads, topic: topics, postCount: visiblePostCount })
    .from(threads)
    .innerJoin(topics, eq(topics.id, threads.topicId))
    .where(eq(threads.id, id))
    .limit(1)
  return row ?? null
}

export function summarize(t: ThreadWithTopic): ThreadSummary {
  return toSummary(t.thread, t.topic.slug, t.postCount)
}

export async function createThreadWithPost(
  db: Db,
  input: { threadId: string; topicId: string; title: string; now: Date; post: NewPost },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(threads).values({
      id: input.threadId,
      topicId: input.topicId,
      title: input.title,
      postCount: 1,
      lastPostAt: input.now,
      createdAt: input.now,
    })
    await tx.insert(posts).values({
      ...input.post,
      threadId: input.threadId,
      seq: 1,
      createdAt: input.now,
    })
  })
}

/** スレッド行をロックして連番を採番し、返信を追加する。スレッドが無ければ null */
export async function appendPost(
  db: Db,
  input: { threadId: string; now: Date; post: NewPost },
): Promise<number | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(threads)
      .set({
        postCount: sql`${threads.postCount} + 1`,
        // 遅れて届いた返信で最終投稿時刻が戻らないようにする
        lastPostAt: sql`GREATEST(${threads.lastPostAt}, ${input.now.toISOString()}::timestamptz)`,
      })
      .where(eq(threads.id, input.threadId))
      .returning({ seq: threads.postCount })
    if (!row) return null
    await tx.insert(posts).values({
      ...input.post,
      threadId: input.threadId,
      seq: row.seq,
      createdAt: input.now,
    })
    return row.seq
  })
}
