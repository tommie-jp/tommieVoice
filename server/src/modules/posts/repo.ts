import { and, count, eq, gte, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { PostPublic } from '../../../../shared/schemas/post.ts'
import type { Db } from '../../db/client.ts'
import { posts, threads, topics, type PostRow } from '../../db/schema/index.ts'
import { toPostPublic, VISIBLE_STATUSES } from './serialize.ts'
import { publicPostCondition } from './visibility.ts'

const PUBLIC_POST = publicPostCondition('"posts"', '"topics"')

const parent = alias(posts, 'parent')

export type NewPost = Omit<
  typeof posts.$inferInsert,
  | 'seq'
  | 'threadId'
  | 'createdAt'
  | 'status'
  | 'publicPath'
  | 'sizeBytes'
  | 'queueOrder'
  | 'airedAt'
  | 'airedRef'
> & { sizeBytes: number }

function postsWithTopic(db: Db) {
  return db
    .select({ post: posts, parentSeq: parent.seq })
    .from(posts)
    .innerJoin(threads, eq(threads.id, posts.threadId))
    .innerJoin(topics, eq(topics.id, threads.topicId))
    .leftJoin(parent, eq(parent.id, posts.parentPostId))
}

/** 一般公開されている投稿（凸待ち箱の未配信分は含まない） */
export async function listVisiblePosts(db: Db, threadId: string): Promise<PostPublic[]> {
  const rows = await postsWithTopic(db)
    .where(and(eq(posts.threadId, threadId), PUBLIC_POST))
    .orderBy(posts.seq)
  return rows.map((r) => toPostPublic(r.post, r.parentSeq))
}

export async function findVisiblePost(db: Db, id: string): Promise<PostPublic | null> {
  const [row] = await postsWithTopic(db)
    .where(and(eq(posts.id, id), PUBLIC_POST))
    .limit(1)
  return row ? toPostPublic(row.post, row.parentSeq) : null
}

/** 投稿者本人や配信者向け。公開前でも処理中・公開済みなら返す */
export async function findLivePost(db: Db, id: string): Promise<PostPublic | null> {
  const [row] = await postsWithTopic(db)
    .where(and(eq(posts.id, id), inArray(posts.status, [...VISIBLE_STATUSES])))
    .limit(1)
  return row ? toPostPublic(row.post, row.parentSeq) : null
}

export async function findPostRow(db: Db, id: string): Promise<PostRow | null> {
  const [row] = await db.select().from(posts).where(eq(posts.id, id)).limit(1)
  return row ?? null
}

export async function countRecentByDevice(
  db: Db,
  deviceIdHash: string,
  since: Date,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(posts)
    .where(and(eq(posts.deviceIdHash, deviceIdHash), gte(posts.createdAt, since)))
  return row?.n ?? 0
}

export async function markPostReady(
  db: Db,
  id: string,
  values: { publicPath: string; durationMs?: number; sizeBytes?: number },
): Promise<void> {
  await db
    .update(posts)
    .set({ status: 'ready', ...values })
    .where(and(eq(posts.id, id), eq(posts.status, 'processing')))
}

export async function setPostStatus(db: Db, id: string, status: PostRow['status']): Promise<void> {
  await db.update(posts).set({ status }).where(eq(posts.id, id))
}

/** 親投稿は同じスレッドの可視な投稿に限る */
export async function parentBelongsToThread(
  db: Db,
  parentId: string,
  threadId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ one: sql<number>`1` })
    .from(posts)
    .innerJoin(threads, eq(threads.id, posts.threadId))
    .innerJoin(topics, eq(topics.id, threads.topicId))
    .where(and(eq(posts.id, parentId), eq(posts.threadId, threadId), PUBLIC_POST))
    .limit(1)
  return row !== undefined
}
