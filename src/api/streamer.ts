import { z } from 'zod'
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '../../shared/constants.ts'
import {
  inboxItemSchema,
  streamerIssuedSchema,
  streamerPublicSchema,
  type ReviewStatus,
} from '../../shared/schemas/streamer.ts'
import { transcriptionStatusSchema } from '../../shared/schemas/transcript.ts'
import { apiRequest, type RequestOptions } from './client'

const csrf = { [CSRF_HEADER]: CSRF_HEADER_VALUE }
const withCsrf = (opts: RequestOptions): RequestOptions => ({
  ...opts,
  headers: { ...csrf, ...opts.headers },
})

const countsSchema = z.object({
  pending: z.number(),
  approved: z.number(),
  rejected: z.number(),
  aired: z.number(),
})
export const meSchema = streamerPublicSchema.extend({ counts: countsSchema })
export type StreamerMe = z.infer<typeof meSchema>

export const streamerLogin = (loginKey: string) =>
  apiRequest(
    '/api/streamer/session',
    streamerPublicSchema,
    withCsrf({ method: 'POST', json: { loginKey } }),
  )

export const streamerLogout = () =>
  apiRequest(
    '/api/streamer/session',
    z.object({ loggedOut: z.literal(true) }),
    withCsrf({ method: 'DELETE' }),
  )

export const fetchMe = () => apiRequest('/api/streamer/me', meSchema)

export const fetchInbox = (status: ReviewStatus) =>
  apiRequest(`/api/streamer/inbox?status=${status}`, z.array(inboxItemSchema))

export type InboxPatch = {
  reviewStatus?: 'pending' | 'approved' | 'rejected'
  queueOrder?: number | null
  airedRef?: string | null
}

export const updateInbox = (postId: string, patch: InboxPatch) =>
  apiRequest(
    `/api/streamer/posts/${encodeURIComponent(postId)}`,
    inboxItemSchema,
    withCsrf({ method: 'PATCH', json: patch }),
  )

export const airPost = (postId: string, airedRef?: string | null) =>
  apiRequest(
    `/api/streamer/posts/${encodeURIComponent(postId)}/air`,
    inboxItemSchema,
    withCsrf({ method: 'POST', json: airedRef ? { airedRef } : {} }),
  )

export const fetchTranscriptionStatus = () =>
  apiRequest('/api/streamer/transcription-status', transcriptionStatusSchema)

// ---- 管理者向け ----
const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

export const adminListStreamers = (token: string) =>
  apiRequest('/api/admin/streamers', z.array(streamerPublicSchema), { headers: bearer(token) })

export const adminCreateStreamer = (token: string, displayName: string) =>
  apiRequest('/api/admin/streamers', streamerIssuedSchema, {
    method: 'POST',
    json: { displayName },
    headers: bearer(token),
  })

export const adminRotateStreamerKey = (token: string, id: string) =>
  apiRequest(`/api/admin/streamers/${encodeURIComponent(id)}/rotate-key`, streamerIssuedSchema, {
    method: 'POST',
    headers: bearer(token),
  })

export const adminSetStreamerDisabled = (token: string, id: string, disabled: boolean) =>
  apiRequest(`/api/admin/streamers/${encodeURIComponent(id)}`, streamerPublicSchema, {
    method: 'PATCH',
    json: { disabled },
    headers: bearer(token),
  })

export const fetchOverlayStatus = () =>
  apiRequest(
    '/api/streamer/overlay-token',
    z.object({ issued: z.boolean(), connections: z.number() }),
  )

export const issueOverlayToken = () =>
  apiRequest(
    '/api/streamer/overlay-token',
    z.object({ token: z.string(), path: z.string() }),
    withCsrf({ method: 'POST' }),
  )

export const controlOverlay = (action: 'next' | 'stop') =>
  apiRequest(
    '/api/streamer/overlay/control',
    z.object({ delivered: z.number(), postId: z.string().nullable() }),
    withCsrf({ method: 'POST', json: { action } }),
  )
