import { pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { REPORT_REASONS } from '../../../../shared/constants.ts'
import { posts } from './posts.ts'

export const reportReason = pgEnum('report_reason', REPORT_REASONS)

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id),
    reason: reportReason('reason').notNull(),
    ipHash: text('ip_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [unique('reports_post_ip_unique').on(t.postId, t.ipHash)],
)

export type ReportRow = typeof reports.$inferSelect
