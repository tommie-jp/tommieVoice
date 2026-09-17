import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/** 配信者アカウント（管理者が手動発行する） */
export const streamers = pgTable('streamers', {
  id: uuid('id').primaryKey(),
  displayName: text('display_name').notNull(),
  loginKeyHash: text('login_key_hash').notNull().unique(),
  /** ログインキーを再発行すると増やし、古いセッションを無効にする */
  sessionVersion: integer('session_version').notNull().default(1),
  overlayTokenHash: text('overlay_token_hash').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
})

export type StreamerRow = typeof streamers.$inferSelect
