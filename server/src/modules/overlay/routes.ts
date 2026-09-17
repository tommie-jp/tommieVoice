import type { FastifyInstance } from 'fastify'
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { okEnvelope } from '../../../../shared/envelope.ts'
import { overlayControlSchema, type OverlayPost } from '../../../../shared/schemas/overlay.ts'
import type { Db } from '../../db/client.ts'
import { posts, streamers, threads, topics, transcripts } from '../../db/schema/index.ts'
import type { Clock } from '../../lib/clock.ts'
import { notFound } from '../../lib/errors.ts'
import { sha256Token } from '../../lib/hash.ts'
import { newToken } from '../../lib/ids.ts'
import { publicAudioUrl } from '../../lib/audioPaths.ts'
import { requireStreamer } from '../../plugins/streamerAuth.ts'
import { markAired } from '../streamer/inbox.ts'
import { formatSse, type SseHub } from './sseHub.ts'

export const PING_MS = 25_000
const tokenParams = z.object({ token: z.string().min(20).max(100) })

export type OverlayRouteDeps = {
  db: Db
  clock: Clock
  sessionKey: string
  hub: SseHub
  pingMs?: number
}

/** 配信で流す投稿の情報（音声・字幕） */
export async function loadOverlayPost(db: Db, postId: string): Promise<OverlayPost | null> {
  const [row] = await db
    .select({ post: posts, threadTitle: threads.title, segments: transcripts.segments })
    .from(posts)
    .innerJoin(threads, eq(threads.id, posts.threadId))
    .leftJoin(transcripts, eq(transcripts.postId, posts.id))
    .where(and(eq(posts.id, postId), eq(posts.status, 'ready'), isNotNull(posts.publicPath)))
    .limit(1)
  if (!row?.post.publicPath) return null
  return {
    id: row.post.id,
    audioUrl: publicAudioUrl(row.post.publicPath),
    authorName: row.post.authorName,
    title: row.post.title,
    threadTitle: row.threadTitle,
    segments: row.segments ?? [],
  }
}

async function nextApproved(db: Db, ownerId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: posts.id })
    .from(posts)
    .innerJoin(threads, eq(threads.id, posts.threadId))
    .innerJoin(topics, eq(topics.id, threads.topicId))
    .where(
      and(
        eq(topics.ownerId, ownerId),
        eq(posts.reviewStatus, 'approved'),
        eq(posts.status, 'ready'),
      ),
    )
    .orderBy(sql`${posts.queueOrder} ASC NULLS LAST`, asc(posts.createdAt))
    .limit(1)
  return row?.id ?? null
}

export function registerOverlayRoutes(app: FastifyInstance, deps: OverlayRouteDeps): void {
  const { db, clock, hub } = deps
  const auth = { db, clock, sessionKey: deps.sessionKey }
  const pingMs = deps.pingMs ?? PING_MS

  app.get('/api/streamer/overlay-token', async (request) => {
    const streamer = await requireStreamer(request, auth)
    return okEnvelope({
      issued: streamer.overlayTokenHash !== null,
      connections: hub.count(streamer.id),
    })
  })

  /** URL は発行時にだけ返す。再発行すると古い URL は使えなくなる */
  app.post('/api/streamer/overlay-token', async (request) => {
    const streamer = await requireStreamer(request, auth)
    const token = newToken()
    await db
      .update(streamers)
      .set({ overlayTokenHash: sha256Token(token) })
      .where(eq(streamers.id, streamer.id))
    return okEnvelope({ token, path: `/overlay/${token}` })
  })

  app.post('/api/streamer/overlay/control', async (request) => {
    const streamer = await requireStreamer(request, auth)
    const { action } = overlayControlSchema.parse(request.body)
    if (action === 'stop') {
      return okEnvelope({ delivered: hub.publish(streamer.id, { type: 'stop' }), postId: null })
    }
    const postId = await nextApproved(db, streamer.id)
    if (!postId) throw notFound('採用済みの声がありません')
    await markAired(db, postId, clock.now(), null)
    const post = await loadOverlayPost(db, postId)
    const delivered = post ? hub.publish(streamer.id, { type: 'play', post }) : 0
    return okEnvelope({ delivered, postId })
  })

  app.get('/api/overlay/:token/events', async (request, reply) => {
    const { token } = tokenParams.parse(request.params)
    const [streamer] = await db
      .select()
      .from(streamers)
      .where(eq(streamers.overlayTokenHash, sha256Token(token)))
      .limit(1)
    if (!streamer || streamer.disabledAt) throw notFound('オーバーレイが見つかりません')

    reply.hijack()
    const res = reply.raw
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    const write = (chunk: string) => {
      if (!res.writableEnded) res.write(chunk)
    }
    write('retry: 3000\n\n')
    write(formatSse({ type: 'hello', streamerName: streamer.displayName }))
    const unsubscribe = hub.subscribe(streamer.id, (event) => write(formatSse(event)))
    const ping = setInterval(() => write(': ping\n\n'), pingMs)
    request.raw.on('close', () => {
      clearInterval(ping)
      unsubscribe()
    })
  })
}

/** 「今流す」から呼ぶ通知（app.ts で配線する） */
export function createAirNotifier(db: Db, hub: SseHub) {
  return (event: { streamerId: string; postId: string }) => {
    void loadOverlayPost(db, event.postId).then((post) => {
      if (post) hub.publish(event.streamerId, { type: 'play', post })
    })
  }
}
