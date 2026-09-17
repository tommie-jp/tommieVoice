import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import type { InboxItem, ReviewStatus } from '../../../../shared/schemas/streamer.ts'
import type { Db } from '../../db/client.ts'
import { posts, threads, topics, transcriptionJobs, transcripts } from '../../db/schema/index.ts'
import { toPostPublic, VISIBLE_STATUSES } from '../posts/serialize.ts'

export const INBOX_PAGE = 100

function baseQuery(db: Db) {
  return db
    .select({
      post: posts,
      threadTitle: threads.title,
      topicSlug: topics.slug,
      topicTitle: topics.title,
      transcript: transcripts,
      jobStatus: transcriptionJobs.status,
    })
    .from(posts)
    .innerJoin(threads, eq(threads.id, posts.threadId))
    .innerJoin(topics, eq(topics.id, threads.topicId))
    .leftJoin(transcripts, eq(transcripts.postId, posts.id))
    .leftJoin(transcriptionJobs, eq(transcriptionJobs.postId, posts.id))
}

type Row = Awaited<ReturnType<ReturnType<typeof baseQuery>['limit']>>[number]

function toItem(row: Row): InboxItem {
  const t = row.transcript
  return {
    post: toPostPublic(row.post, null),
    threadId: row.post.threadId,
    threadTitle: row.threadTitle,
    topicSlug: row.topicSlug,
    topicTitle: row.topicTitle,
    queueOrder: row.post.queueOrder,
    transcript: t
      ? {
          text: t.text,
          summary: t.summary,
          tags: t.tags,
          riskFlags: t.riskFlags,
          segments: t.segments,
        }
      : null,
    transcriptState: t ? 'done' : (row.jobStatus ?? 'none'),
  }
}

function ownedLive(ownerId: string) {
  return and(
    eq(topics.ownerId, ownerId),
    eq(topics.mode, 'inbox'),
    inArray(posts.status, [...VISIBLE_STATUSES]),
  )
}

const ORDER: Readonly<Record<ReviewStatus, ReturnType<typeof asc>[]>> = {
  pending: [asc(posts.createdAt)],
  approved: [sql`${posts.queueOrder} ASC NULLS LAST`, asc(posts.createdAt)],
  aired: [desc(posts.airedAt)],
  rejected: [desc(posts.createdAt)],
}

export async function listInbox(
  db: Db,
  ownerId: string,
  status: ReviewStatus,
): Promise<InboxItem[]> {
  const rows = await baseQuery(db)
    .where(and(ownedLive(ownerId), eq(posts.reviewStatus, status)))
    .orderBy(...ORDER[status])
    .limit(INBOX_PAGE)
  return rows.map(toItem)
}

export async function findInboxItem(
  db: Db,
  ownerId: string,
  postId: string,
): Promise<InboxItem | null> {
  const [row] = await baseQuery(db)
    .where(and(ownedLive(ownerId), eq(posts.id, postId)))
    .limit(1)
  return row ? toItem(row) : null
}

export async function countInbox(db: Db, ownerId: string): Promise<Record<ReviewStatus, number>> {
  const rows = await db
    .select({ status: posts.reviewStatus, n: sql<number>`count(*)::int` })
    .from(posts)
    .innerJoin(threads, eq(threads.id, posts.threadId))
    .innerJoin(topics, eq(topics.id, threads.topicId))
    .where(ownedLive(ownerId))
    .groupBy(posts.reviewStatus)
  const counts = { pending: 0, approved: 0, rejected: 0, aired: 0 }
  for (const r of rows) if (r.status) counts[r.status] = r.n
  return counts
}

export type InboxPatch = {
  reviewStatus?: 'pending' | 'approved' | 'rejected'
  queueOrder?: number | null
  airedRef?: string | null
}

export async function updateInboxPost(db: Db, postId: string, patch: InboxPatch): Promise<void> {
  const values: Partial<typeof posts.$inferInsert> = { ...patch }
  // 採用したら順番を末尾に付ける（明示指定があればそれを使う）
  if (patch.reviewStatus === 'approved' && patch.queueOrder === undefined) {
    values.queueOrder = sql`(
      SELECT coalesce(max(qp.queue_order), 0) + 1 FROM posts qp
      JOIN threads qt ON qt.id = qp.thread_id
      WHERE qt.topic_id = (SELECT t2.topic_id FROM threads t2 JOIN posts p2 ON p2.thread_id = t2.id WHERE p2.id = ${postId})
    )` as unknown as number
  }
  if (patch.reviewStatus && patch.reviewStatus !== 'approved' && patch.queueOrder === undefined) {
    values.queueOrder = null
  }
  await db.update(posts).set(values).where(eq(posts.id, postId))
}

export async function markAired(
  db: Db,
  postId: string,
  now: Date,
  airedRef: string | null,
): Promise<void> {
  await db
    .update(posts)
    .set({
      reviewStatus: 'aired',
      airedAt: now,
      queueOrder: null,
      ...(airedRef ? { airedRef } : {}),
    })
    .where(eq(posts.id, postId))
}
