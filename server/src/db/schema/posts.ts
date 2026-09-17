import {
  type AnyPgColumn,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { threads } from './threads.ts'

export const POST_STATUSES = ['processing', 'ready', 'failed', 'hidden', 'deleted'] as const
export type PostStatus = (typeof POST_STATUSES)[number]
export const postStatus = pgEnum('post_status', POST_STATUSES)

export const REVIEW_STATUSES = ['pending', 'approved', 'rejected', 'aired'] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]
export const reviewStatus = pgEnum('review_status', REVIEW_STATUSES)

export const posts = pgTable(
  'posts',
  {
    id: uuid('id').primaryKey(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => threads.id),
    parentPostId: uuid('parent_post_id').references((): AnyPgColumn => posts.id),
    seq: integer('seq').notNull(),
    title: text('title'),
    authorName: text('author_name'),
    deviceIdHash: text('device_id_hash').notNull(),
    ipHash: text('ip_hash').notNull(),
    deleteTokenHash: text('delete_token_hash').notNull(),
    originalPath: text('original_path').notNull(),
    originalMime: text('original_mime').notNull(),
    publicPath: text('public_path'),
    durationMs: integer('duration_ms'),
    sizeBytes: integer('size_bytes'),
    status: postStatus('status').notNull().default('processing'),
    /** 凸待ち箱の投稿だけが持つ */
    reviewStatus: reviewStatus('review_status'),
    queueOrder: integer('queue_order'),
    airedAt: timestamp('aired_at', { withTimezone: true }),
    airedRef: text('aired_ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('posts_thread_seq_unique').on(t.threadId, t.seq),
    index('posts_device_created_idx').on(t.deviceIdHash, t.createdAt),
    index('posts_review_idx').on(t.reviewStatus, t.createdAt),
  ],
)

export type PostRow = typeof posts.$inferSelect
