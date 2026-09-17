import { z } from 'zod'
import { transcriptSegmentSchema } from './transcript.ts'

export const overlayPostSchema = z.object({
  id: z.string(),
  audioUrl: z.string(),
  authorName: z.string().nullable(),
  title: z.string().nullable(),
  threadTitle: z.string(),
  segments: z.array(transcriptSegmentSchema),
})
export type OverlayPost = z.infer<typeof overlayPostSchema>

export const overlayEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), streamerName: z.string() }),
  z.object({ type: z.literal('play'), post: overlayPostSchema }),
  z.object({ type: z.literal('stop') }),
])
export type OverlayEvent = z.infer<typeof overlayEventSchema>

export const overlayControlSchema = z.object({ action: z.enum(['stop', 'next']) })

export const overlayTokenIssuedSchema = z.object({ token: z.string(), path: z.string() })
