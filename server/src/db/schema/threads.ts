import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { topics } from './topics.ts'

export const threads = pgTable(
  'threads',
  {
    id: uuid('id').primaryKey(),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id),
    title: text('title').notNull(),
    postCount: integer('post_count').notNull().default(0),
    lastPostAt: timestamp('last_post_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('threads_topic_last_post_idx').on(t.topicId, t.lastPostAt.desc(), t.id.desc())],
)

export type ThreadRow = typeof threads.$inferSelect
