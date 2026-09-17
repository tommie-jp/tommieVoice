import { boolean, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { PUBLISH_POLICIES, TOPIC_MODES } from '../../../../shared/schemas/topic.ts'
import { streamers } from './streamers.ts'

export const topicMode = pgEnum('topic_mode', TOPIC_MODES)
export const publishPolicy = pgEnum('publish_policy', PUBLISH_POLICIES)

export const topics = pgTable('topics', {
  id: uuid('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  scriptText: text('script_text'),
  sortOrder: integer('sort_order').notNull().default(0),
  isClosed: boolean('is_closed').notNull().default(false),
  /** board = 公開掲示板、inbox = 配信者の凸待ち箱 */
  mode: topicMode('mode').notNull().default('board'),
  ownerId: uuid('owner_id').references(() => streamers.id),
  /** inbox の投稿をいつ公開するか */
  publishOn: publishPolicy('publish_on').notNull().default('immediately'),
  /** 文字起こしジョブを作るか */
  transcribe: boolean('transcribe').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type TopicRow = typeof topics.$inferSelect
