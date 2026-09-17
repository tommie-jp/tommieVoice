import { z } from 'zod'
import { postCreatedSchema, postPublicSchema } from '../../shared/schemas/post.ts'
import {
  threadCreatedSchema,
  threadDetailSchema,
  threadSummarySchema,
} from '../../shared/schemas/thread.ts'
import {
  topicPublicSchema,
  type TopicCreateInput,
  type TopicUpdateInput,
} from '../../shared/schemas/topic.ts'
import {
  adminPostSchema,
  reportSummarySchema,
  type ReportCreateInput,
} from '../../shared/schemas/report.ts'
import { ApiError, apiRequest } from './client'
import { getDeviceId } from '../lib/deviceId'

export type RecordedAudio = { blob: Blob; mimeType: string; durationMs: number }

function audioForm(
  audio: RecordedAudio,
  fields: Record<string, string | null | undefined>,
): FormData {
  const form = new FormData()
  // テキストを先に置く（サーバはストリームで順に読む）
  for (const [key, value] of Object.entries(fields)) {
    if (value !== null && value !== undefined && value !== '') form.set(key, value)
  }
  form.set('durationMs', String(Math.max(1, Math.round(audio.durationMs))))
  const ext = audio.mimeType.startsWith('audio/mp4')
    ? 'm4a'
    : audio.mimeType.startsWith('audio/ogg')
      ? 'ogg'
      : 'webm'
  form.set('audio', audio.blob, `voice.${ext}`)
  return form
}

export const fetchTopics = () => apiRequest('/api/topics', z.array(topicPublicSchema))

export const fetchThreads = (slug: string, cursor?: string | null) =>
  apiRequest(
    `/api/topics/${encodeURIComponent(slug)}/threads${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    z.array(threadSummarySchema),
  )

export const fetchThread = (id: string) =>
  apiRequest(`/api/threads/${encodeURIComponent(id)}`, threadDetailSchema)

export const fetchPost = (id: string) =>
  apiRequest(`/api/posts/${encodeURIComponent(id)}`, postPublicSchema)

export const createThread = (
  slug: string,
  audio: RecordedAudio,
  fields: { title: string; authorName?: string | null },
) =>
  apiRequest(`/api/topics/${encodeURIComponent(slug)}/threads`, threadCreatedSchema, {
    method: 'POST',
    form: audioForm(audio, fields),
  })

export const createReply = (
  threadId: string,
  audio: RecordedAudio,
  fields: { title?: string | null; authorName?: string | null; parentPostId?: string | null },
) =>
  apiRequest(`/api/threads/${encodeURIComponent(threadId)}/posts`, postCreatedSchema, {
    method: 'POST',
    form: audioForm(audio, fields),
  })

const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

export const adminCreateTopic = (token: string, input: TopicCreateInput) =>
  apiRequest('/api/admin/topics', topicPublicSchema, {
    method: 'POST',
    json: input,
    headers: bearer(token),
  })

export const adminUpdateTopic = (token: string, id: string, patch: TopicUpdateInput) =>
  apiRequest(`/api/admin/topics/${encodeURIComponent(id)}`, topicPublicSchema, {
    method: 'PATCH',
    json: patch,
    headers: bearer(token),
  })

export const deletePost = (postId: string, token: string) =>
  apiRequest(
    `/api/posts/${encodeURIComponent(postId)}`,
    z.object({ id: z.string(), deleted: z.literal(true) }),
    { method: 'DELETE', headers: { 'x-delete-token': token } },
  )

export const reportPost = (postId: string, reason: ReportCreateInput['reason']) =>
  apiRequest(
    `/api/posts/${encodeURIComponent(postId)}/reports`,
    z.object({ postId: z.string(), reported: z.literal(true) }),
    { method: 'POST', json: { reason } },
  )

export const adminFetchReports = (token: string) =>
  apiRequest('/api/admin/reports', z.array(reportSummarySchema), { headers: bearer(token) })

export const adminUpdatePost = (
  token: string,
  id: string,
  status: 'ready' | 'hidden' | 'deleted',
) =>
  apiRequest(`/api/admin/posts/${encodeURIComponent(id)}`, adminPostSchema, {
    method: 'PATCH',
    json: { status },
    headers: bearer(token),
  })

export const adminResolveReports = (token: string, id: string) =>
  apiRequest(
    `/api/admin/posts/${encodeURIComponent(id)}/resolve-reports`,
    z.object({ postId: z.string(), resolved: z.number() }),
    { method: 'POST', headers: bearer(token) },
  )

/** 非表示の投稿も含め、管理者として音声を取得する */
export async function adminFetchAudio(token: string, id: string): Promise<Blob> {
  let res: Response
  try {
    res = await fetch(`/api/admin/posts/${encodeURIComponent(id)}/audio`, {
      headers: { ...bearer(token), 'x-device-id': getDeviceId() },
    })
  } catch {
    throw new ApiError(0, 'network_error', '通信できませんでした')
  }
  if (!res.ok) throw new ApiError(res.status, 'audio_unavailable', '音声を取得できませんでした')
  return res.blob()
}

export const fetchMyPosts = (items: { id: string; token: string }[]) =>
  apiRequest('/api/posts/mine', z.array(postPublicSchema), { method: 'POST', json: { items } })
