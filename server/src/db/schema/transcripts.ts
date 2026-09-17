import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import type { TranscriptSegment } from '../../../../shared/schemas/transcript.ts'
import { posts } from './posts.ts'

export const transcripts = pgTable('transcripts', {
  postId: uuid('post_id')
    .primaryKey()
    .references(() => posts.id),
  engine: text('engine').notNull(),
  model: text('model'),
  language: text('language'),
  text: text('text').notNull(),
  segments: jsonb('segments').$type<TranscriptSegment[]>().notNull().default([]),
  summary: text('summary').notNull(),
  tags: text('tags').array().notNull().default([]),
  riskFlags: text('risk_flags').array().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type TranscriptRow = typeof transcripts.$inferSelect

export const JOB_STATUSES = ['queued', 'leased', 'done', 'failed'] as const
export const jobStatus = pgEnum('transcription_job_status', JOB_STATUSES)

export const transcriptionJobs = pgTable(
  'transcription_jobs',
  {
    id: uuid('id').primaryKey(),
    postId: uuid('post_id')
      .notNull()
      .unique()
      .references(() => posts.id),
    status: jobStatus('status').notNull().default('queued'),
    workerId: text('worker_id'),
    leaseTokenHash: text('lease_token_hash'),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('transcription_jobs_status_idx').on(t.status, t.createdAt)],
)

export type TranscriptionJobRow = typeof transcriptionJobs.$inferSelect

/** ワーカー（ブラウザ・GPU コンテナ）の最終接続時刻 */
export const workerHeartbeats = pgTable('worker_heartbeats', {
  workerKey: text('worker_key').primaryKey(),
  seenAt: timestamp('seen_at', { withTimezone: true }).notNull(),
})
