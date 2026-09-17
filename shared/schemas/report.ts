import { z } from 'zod'
import { REPORT_REASONS } from '../constants.ts'
import { isoDateSchema, uuidSchema } from './common.ts'

export const reportCreateSchema = z.object({ reason: z.enum(REPORT_REASONS) })
export type ReportCreateInput = z.infer<typeof reportCreateSchema>

export const REPORT_REASON_LABELS: Readonly<Record<(typeof REPORT_REASONS)[number], string>> = {
  abuse: '誹謗中傷・嫌がらせ',
  privacy: '個人情報',
  copyright: '著作権（BGM・他人の声など）',
  spam: '宣伝・スパム',
  other: 'その他',
}

export const ADMIN_POST_STATUSES = ['ready', 'hidden', 'deleted'] as const

export const adminPostSchema = z.object({
  id: uuidSchema,
  threadId: uuidSchema,
  threadTitle: z.string(),
  topicSlug: z.string(),
  seq: z.number().int(),
  title: z.string().nullable(),
  authorName: z.string().nullable(),
  status: z.enum(['processing', 'ready', 'failed', 'hidden', 'deleted']),
  durationMs: z.number().int().nullable(),
  createdAt: isoDateSchema,
  hasAudio: z.boolean(),
})
export type AdminPost = z.infer<typeof adminPostSchema>

export const reportSummarySchema = z.object({
  post: adminPostSchema,
  count: z.number().int().positive(),
  reasons: z.record(z.enum(REPORT_REASONS), z.number().int()),
  firstReportedAt: isoDateSchema,
})
export type ReportSummary = z.infer<typeof reportSummarySchema>

export const adminPostUpdateSchema = z.object({ status: z.enum(ADMIN_POST_STATUSES) })
