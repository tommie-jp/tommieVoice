import { and, asc, count, eq, isNull, min, sql } from 'drizzle-orm'
import { REPORT_REASONS, type ReportReason } from '../../../../shared/constants.ts'
import type { AdminPost, ReportSummary } from '../../../../shared/schemas/report.ts'
import type { Db } from '../../db/client.ts'
import { posts, reports, threads, topics, type PostRow } from '../../db/schema/index.ts'
import { newId } from '../../lib/ids.ts'

export async function insertReport(
  db: Db,
  values: { postId: string; reason: ReportReason; ipHash: string; now: Date },
): Promise<boolean> {
  const rows = await db
    .insert(reports)
    .values({
      id: newId(),
      postId: values.postId,
      reason: values.reason,
      ipHash: values.ipHash,
      createdAt: values.now,
    })
    .onConflictDoNothing()
    .returning({ id: reports.id })
  return rows.length > 0
}

export async function resolveReports(db: Db, postId: string, now: Date): Promise<number> {
  const rows = await db
    .update(reports)
    .set({ resolvedAt: now })
    .where(and(eq(reports.postId, postId), isNull(reports.resolvedAt)))
    .returning({ id: reports.id })
  return rows.length
}

type AdminPostRow = { post: PostRow; threadTitle: string; topicSlug: string }

export function toAdminPost({ post, threadTitle, topicSlug }: AdminPostRow): AdminPost {
  return {
    id: post.id,
    threadId: post.threadId,
    threadTitle,
    topicSlug,
    seq: post.seq,
    title: post.title,
    authorName: post.authorName,
    status: post.status,
    durationMs: post.durationMs,
    createdAt: post.createdAt.toISOString(),
    hasAudio: post.publicPath !== null,
  }
}

export async function findAdminPost(db: Db, id: string): Promise<AdminPostRow | null> {
  const [row] = await db
    .select({ post: posts, threadTitle: threads.title, topicSlug: topics.slug })
    .from(posts)
    .innerJoin(threads, eq(threads.id, posts.threadId))
    .innerJoin(topics, eq(topics.id, threads.topicId))
    .where(eq(posts.id, id))
    .limit(1)
  return row ?? null
}

const MAX_REPORTED = 100

/** 未対応の通報を投稿ごとにまとめ、古い順に返す */
export async function listOpenReports(db: Db): Promise<ReportSummary[]> {
  const grouped = await db
    .select({
      postId: reports.postId,
      reason: reports.reason,
      n: count(),
      first: min(reports.createdAt),
    })
    .from(reports)
    .where(isNull(reports.resolvedAt))
    .groupBy(reports.postId, reports.reason)
    .orderBy(asc(sql`min(${reports.createdAt})`))
  const byPost = new Map<
    string,
    { reasons: Record<ReportReason, number>; count: number; first: Date }
  >()
  for (const g of grouped) {
    const entry = byPost.get(g.postId) ?? {
      reasons: Object.fromEntries(REPORT_REASONS.map((r) => [r, 0])) as Record<
        ReportReason,
        number
      >,
      count: 0,
      first: g.first ?? new Date(0),
    }
    byPost.set(g.postId, {
      reasons: { ...entry.reasons, [g.reason]: g.n },
      count: entry.count + g.n,
      first: g.first && g.first < entry.first ? g.first : entry.first,
    })
  }
  const summaries: ReportSummary[] = []
  for (const [postId, entry] of [...byPost].slice(0, MAX_REPORTED)) {
    const found = await findAdminPost(db, postId)
    if (!found) continue
    summaries.push({
      post: toAdminPost(found),
      count: entry.count,
      reasons: entry.reasons,
      firstReportedAt: entry.first.toISOString(),
    })
  }
  return summaries.sort((a, b) => a.firstReportedAt.localeCompare(b.firstReportedAt))
}
