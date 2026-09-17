import { z } from 'zod'
import {
  SCRIPT_TEXT_MAX_LENGTH,
  TOPIC_DESCRIPTION_MAX_LENGTH,
  TOPIC_TITLE_MAX_LENGTH,
} from '../constants.ts'
import { isoDateSchema, optionalText, requiredText, uuidSchema } from './common.ts'

export const TOPIC_MODES = ['board', 'inbox'] as const
export type TopicMode = (typeof TOPIC_MODES)[number]
/** inbox の投稿を公開するタイミング（設計メモ 03 の決定: 配信で流した後） */
export const PUBLISH_POLICIES = ['immediately', 'aired'] as const
export type PublishPolicy = (typeof PUBLISH_POLICIES)[number]

export const TOPIC_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,39}$/

export const topicSlugSchema = z
  .string()
  .regex(TOPIC_SLUG_PATTERN, 'slug は英小文字・数字・ハイフンの 2〜40 文字')

export const topicPublicSchema = z.object({
  id: uuidSchema,
  slug: topicSlugSchema,
  title: z.string(),
  description: z.string().nullable(),
  scriptText: z.string().nullable(),
  sortOrder: z.number().int(),
  isClosed: z.boolean(),
  mode: z.enum(TOPIC_MODES),
  publishOn: z.enum(PUBLISH_POLICIES),
  ownerName: z.string().nullable(),
  threadCount: z.number().int().nonnegative(),
  createdAt: isoDateSchema,
})
export type TopicPublic = z.infer<typeof topicPublicSchema>

export const topicCreateSchema = z.object({
  slug: topicSlugSchema,
  title: requiredText(TOPIC_TITLE_MAX_LENGTH),
  description: optionalText(TOPIC_DESCRIPTION_MAX_LENGTH),
  scriptText: optionalText(SCRIPT_TEXT_MAX_LENGTH),
  sortOrder: z.number().int().min(-10000).max(10000).default(0),
  mode: z.enum(TOPIC_MODES).default('board'),
  ownerId: uuidSchema.nullish(),
  publishOn: z.enum(PUBLISH_POLICIES).optional(),
  transcribe: z.boolean().optional(),
})
export type TopicCreateInput = z.input<typeof topicCreateSchema>

export const topicUpdateSchema = z
  .object({
    title: requiredText(TOPIC_TITLE_MAX_LENGTH),
    description: optionalText(TOPIC_DESCRIPTION_MAX_LENGTH),
    scriptText: optionalText(SCRIPT_TEXT_MAX_LENGTH),
    sortOrder: z.number().int().min(-10000).max(10000),
    isClosed: z.boolean(),
    ownerId: uuidSchema.nullable(),
    publishOn: z.enum(PUBLISH_POLICIES),
    transcribe: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, '更新する項目がありません')
export type TopicUpdateInput = z.input<typeof topicUpdateSchema>
