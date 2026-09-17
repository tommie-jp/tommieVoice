import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { TopicPublic } from '../../../shared/schemas/topic.ts'
import { fixture, multipart, type FilePart } from './multipart.ts'

export const adminHeaders = () => ({ authorization: `Bearer ${process.env.ADMIN_TOKEN}` })

export async function createTopic(
  app: FastifyInstance,
  body: Record<string, unknown> = {},
): Promise<TopicPublic> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/topics',
    headers: adminHeaders(),
    payload: { slug: `topic-${randomUUID().slice(0, 8)}`, title: 'テスト', ...body },
  })
  if (res.statusCode !== 201) throw new Error(`createTopic failed: ${res.statusCode} ${res.body}`)
  return res.json().data
}

export type PostOptions = {
  deviceId?: string
  fields?: Record<string, string>
  file?: FilePart | null
  ip?: string
}

function upload(opts: PostOptions, defaults: Record<string, string>) {
  const file = opts.file === null ? undefined : (opts.file ?? { data: fixture('sample.webm') })
  const body = multipart({ ...defaults, ...opts.fields }, file)
  return {
    payload: body.payload,
    headers: { ...body.headers, 'x-device-id': opts.deviceId ?? randomUUID() },
    ...(opts.ip ? { remoteAddress: opts.ip } : {}),
  }
}

export function postThread(app: FastifyInstance, slug: string, opts: PostOptions = {}) {
  return app.inject({
    method: 'POST',
    url: `/api/topics/${slug}/threads`,
    ...upload(opts, { title: '最初の声', durationMs: '1000' }),
  })
}

export function postReply(app: FastifyInstance, threadId: string, opts: PostOptions = {}) {
  return app.inject({
    method: 'POST',
    url: `/api/threads/${threadId}/posts`,
    ...upload(opts, { durationMs: '1000' }),
  })
}

export async function createStreamer(app: FastifyInstance, displayName = '配信者A') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/streamers',
    headers: adminHeaders(),
    payload: { displayName },
  })
  if (res.statusCode !== 201)
    throw new Error(`createStreamer failed: ${res.statusCode} ${res.body}`)
  return res.json().data as { streamer: { id: string; displayName: string }; loginKey: string }
}

export const CSRF = { 'x-requested-with': 'tommieVoice' }

/** ログインして Cookie ヘッダ値を返す */
export async function loginStreamer(app: FastifyInstance, loginKey: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/streamer/session',
    headers: CSRF,
    payload: { loginKey },
  })
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`)
  const cookie = res.cookies.find((c) => c.name === 'tv_streamer')
  if (!cookie) throw new Error('no session cookie')
  return `${cookie.name}=${cookie.value}`
}

export async function createInbox(
  app: FastifyInstance,
  ownerId: string,
  body: Record<string, unknown> = {},
) {
  return createTopic(app, { mode: 'inbox', ownerId, title: '凸待ち箱', ...body })
}
