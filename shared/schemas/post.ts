import { z } from 'zod'
import { AUTHOR_NAME_MAX_LENGTH, MAX_REPORTED_DURATION_MS, TITLE_MAX_LENGTH } from '../constants.ts'
import { isoDateSchema, optionalText, requiredText, uuidSchema } from './common.ts'

const durationField = z.coerce.number().int().min(1).max(MAX_REPORTED_DURATION_MS)

/** 返信の multipart フィールド */
export const replyFieldsSchema = z.object({
  title: optionalText(TITLE_MAX_LENGTH),
  authorName: optionalText(AUTHOR_NAME_MAX_LENGTH),
  durationMs: durationField,
  parentPostId: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? null : v))
    .pipe(uuidSchema.nullable()),
})
export type ReplyFields = z.output<typeof replyFieldsSchema>

/** 新スレッド（親投稿）の multipart フィールド。タイトル必須 */
export const threadFieldsSchema = z.object({
  title: requiredText(TITLE_MAX_LENGTH),
  authorName: optionalText(AUTHOR_NAME_MAX_LENGTH),
  durationMs: durationField,
})
export type ThreadFields = z.output<typeof threadFieldsSchema>

export const PUBLIC_POST_STATUSES = ['processing', 'ready'] as const

export const postPublicSchema = z.object({
  id: uuidSchema,
  threadId: uuidSchema,
  seq: z.number().int().positive(),
  parentPostId: uuidSchema.nullable(),
  parentSeq: z.number().int().positive().nullable(),
  title: z.string().nullable(),
  authorName: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  status: z.enum(PUBLIC_POST_STATUSES),
  audioUrl: z.string().nullable(),
  /** 凸待ち箱の投稿だけが持つ */
  reviewStatus: z.enum(['pending', 'approved', 'rejected', 'aired']).nullable(),
  airedAt: isoDateSchema.nullable(),
  airedRef: z.string().nullable(),
  createdAt: isoDateSchema,
})
export type PostPublic = z.infer<typeof postPublicSchema>

/** 投稿作成の応答。deleteToken はこの 1 回しか返らない。変換失敗時は post が null */
export const postCreatedSchema = z.object({
  post: postPublicSchema.nullable(),
  deleteToken: z.string().min(20),
})
export type PostCreated = z.infer<typeof postCreatedSchema>

/** 端末 ID（クライアントが生成して localStorage に保持する UUID） */
export const deviceIdSchema = uuidSchema
