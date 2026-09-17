import { asc, eq, sql } from 'drizzle-orm'
import type { TopicPublic } from '../../../../shared/schemas/topic.ts'
import type { Db } from '../../db/client.ts'
import { streamers, topics, type TopicRow } from '../../db/schema/index.ts'
import { badRequest } from '../../lib/errors.ts'
import { publicPostCondition } from '../posts/visibility.ts'

// 相関サブクエリは列名が曖昧にならないよう別名と完全修飾名で書く
// 見える投稿が 1 件以上あるスレッドだけ数える（一覧と件数を一致させる）
const threadCount = sql<number>`(
  SELECT count(*)::int FROM threads AS tc
  WHERE tc.topic_id = "topics"."id"
    AND EXISTS (
      SELECT 1 FROM posts AS tp
      WHERE tp.thread_id = tc.id AND ${publicPostCondition('tp', '"topics"')}
    )
)`

export function toTopicPublic(row: TopicRow, count: number, ownerName: string | null): TopicPublic {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    scriptText: row.scriptText,
    sortOrder: row.sortOrder,
    isClosed: row.isClosed,
    mode: row.mode,
    publishOn: row.publishOn,
    ownerName,
    threadCount: count,
    createdAt: row.createdAt.toISOString(),
  }
}

function topicsWithOwner(db: Db) {
  return db
    .select({ topic: topics, threadCount, ownerName: streamers.displayName })
    .from(topics)
    .leftJoin(streamers, eq(streamers.id, topics.ownerId))
}

export async function listTopics(db: Db): Promise<TopicPublic[]> {
  const rows = await topicsWithOwner(db).orderBy(asc(topics.sortOrder), asc(topics.createdAt))
  return rows.map((r) => toTopicPublic(r.topic, r.threadCount, r.ownerName))
}

export async function findTopicBySlug(db: Db, slug: string): Promise<TopicRow | null> {
  const [row] = await db.select().from(topics).where(eq(topics.slug, slug)).limit(1)
  return row ?? null
}

export async function findTopicWithCount(db: Db, id: string): Promise<TopicPublic | null> {
  const [row] = await topicsWithOwner(db).where(eq(topics.id, id)).limit(1)
  return row ? toTopicPublic(row.topic, row.threadCount, row.ownerName) : null
}

export type NewTopic = Omit<typeof topics.$inferInsert, 'createdAt' | 'isClosed'>

const FOREIGN_KEY_VIOLATION = '23503'

function rethrowOwnerError(err: unknown): never {
  const code =
    (err as { cause?: { code?: string }; code?: string }).cause?.code ??
    (err as { code?: string }).code
  if (code === FOREIGN_KEY_VIOLATION) throw badRequest('指定した配信者がいません')
  throw err
}

export async function insertTopic(db: Db, values: NewTopic): Promise<TopicRow | null> {
  try {
    const [row] = await db.insert(topics).values(values).onConflictDoNothing().returning()
    return row ?? null
  } catch (err) {
    rethrowOwnerError(err)
  }
}

export type TopicPatch = Partial<
  Pick<
    TopicRow,
    | 'title'
    | 'description'
    | 'scriptText'
    | 'sortOrder'
    | 'isClosed'
    | 'ownerId'
    | 'publishOn'
    | 'transcribe'
  >
>

export async function updateTopic(db: Db, id: string, patch: TopicPatch): Promise<boolean> {
  try {
    const rows = await db
      .update(topics)
      .set(patch)
      .where(eq(topics.id, id))
      .returning({ id: topics.id })
    return rows.length > 0
  } catch (err) {
    rethrowOwnerError(err)
  }
}
