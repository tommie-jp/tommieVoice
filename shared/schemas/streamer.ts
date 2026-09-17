import { z } from 'zod'
import { AUTHOR_NAME_MAX_LENGTH } from '../constants.ts'
import { isoDateSchema, requiredText, uuidSchema } from './common.ts'
import { postPublicSchema } from './post.ts'

export const REVIEW_STATUSES = ['pending', 'approved', 'rejected', 'aired'] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

/** 配信 URL（画面でリンクにするので http/https だけ許す） */
export const airedRefSchema = z.url({ protocol: /^https?$/, hostname: z.regexes.domain }).max(500)

export const streamerPublicSchema = z.object({
  id: uuidSchema,
  displayName: z.string(),
  createdAt: isoDateSchema,
  disabled: z.boolean(),
})
export type StreamerPublic = z.infer<typeof streamerPublicSchema>

export const streamerCreateSchema = z.object({ displayName: requiredText(40) })

export const streamerIssuedSchema = z.object({
  streamer: streamerPublicSchema,
  /** この 1 回しか表示されない */
  loginKey: z.string(),
})

export const streamerLoginSchema = z.object({ loginKey: z.string().min(20).max(200) })

export const inboxItemSchema = z.object({
  post: postPublicSchema,
  threadId: uuidSchema,
  threadTitle: z.string(),
  topicSlug: z.string(),
  topicTitle: z.string(),
  queueOrder: z.number().int().nullable(),
  transcript: z
    .object({
      text: z.string(),
      summary: z.string(),
      tags: z.array(z.string()),
      riskFlags: z.array(z.string()),
      segments: z.array(z.object({ start: z.number(), end: z.number(), text: z.string() })),
    })
    .nullable(),
  transcriptState: z.enum(['none', 'queued', 'leased', 'done', 'failed']),
})
export type InboxItem = z.infer<typeof inboxItemSchema>

export const inboxUpdateSchema = z
  .object({
    reviewStatus: z.enum(['pending', 'approved', 'rejected']),
    queueOrder: z.number().int().min(0).max(100_000).nullable(),
    airedRef: airedRefSchema.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, '更新する項目がありません')

export const airSchema = z.object({ airedRef: airedRefSchema.nullish() })

/** 配信者が投稿を扱うときに表示する名前の上限（投稿者名と同じ） */
export const STREAMER_NAME_MAX = AUTHOR_NAME_MAX_LENGTH
