import { z } from 'zod'
import { isoDateSchema, uuidSchema } from './common.ts'
import { postCreatedSchema, postPublicSchema } from './post.ts'
import { topicSlugSchema } from './topic.ts'

export const threadSummarySchema = z.object({
  id: uuidSchema,
  topicId: uuidSchema,
  topicSlug: topicSlugSchema,
  title: z.string(),
  postCount: z.number().int().nonnegative(),
  lastPostAt: isoDateSchema,
  createdAt: isoDateSchema,
})
export type ThreadSummary = z.infer<typeof threadSummarySchema>

export const threadDetailSchema = z.object({
  thread: threadSummarySchema.extend({ topicTitle: z.string(), topicIsClosed: z.boolean() }),
  posts: z.array(postPublicSchema),
})
export type ThreadDetail = z.infer<typeof threadDetailSchema>

export const threadCreatedSchema = postCreatedSchema.extend({
  thread: threadSummarySchema.nullable(),
})
export type ThreadCreated = z.infer<typeof threadCreatedSchema>
