import { z } from 'zod'
import { isoDateSchema, uuidSchema } from './common.ts'

export const TRANSCRIPT_TEXT_MAX = 20_000
export const MAX_SEGMENTS = 2_000

export const transcriptSegmentSchema = z
  .object({
    start: z.number().min(0).max(3600),
    end: z.number().min(0).max(3600),
    text: z.string().max(2_000),
  })
  .refine((s) => s.end >= s.start, 'end は start 以上')
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>

export const transcriptResultSchema = z.object({
  engine: z.string().trim().min(1).max(60),
  model: z.string().trim().max(120).nullish(),
  language: z.string().trim().max(10).nullish(),
  text: z.string().max(TRANSCRIPT_TEXT_MAX),
  segments: z.array(transcriptSegmentSchema).max(MAX_SEGMENTS).default([]),
})
export type TranscriptResult = z.input<typeof transcriptResultSchema>

export const TRIAGE_TAGS = ['question', 'script', 'request', 'greeting'] as const
export const RISK_FLAGS = ['ng_word', 'contact_info', 'empty'] as const

export const transcriptPublicSchema = z.object({
  postId: uuidSchema,
  engine: z.string(),
  language: z.string().nullable(),
  text: z.string(),
  segments: z.array(transcriptSegmentSchema),
  summary: z.string(),
  tags: z.array(z.string()),
  riskFlags: z.array(z.string()),
  createdAt: isoDateSchema,
})
export type TranscriptPublic = z.infer<typeof transcriptPublicSchema>

export const workerJobSchema = z.object({
  id: uuidSchema,
  postId: uuidSchema,
  leaseToken: z.string(),
  leaseUntil: isoDateSchema,
  durationMs: z.number().int().nullable(),
  audioPath: z.string(),
})
export type WorkerJob = z.infer<typeof workerJobSchema>

export const transcriptionStatusSchema = z.object({
  waiting: z.number().int().nonnegative(),
  leased: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  lastWorkerSeenAt: isoDateSchema.nullable(),
})
export type TranscriptionStatus = z.infer<typeof transcriptionStatusSchema>
