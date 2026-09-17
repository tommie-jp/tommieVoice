import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { RATE_LIMITS } from '../../../../shared/constants.ts'
import { okEnvelope } from '../../../../shared/envelope.ts'
import {
  airSchema,
  inboxUpdateSchema,
  REVIEW_STATUSES,
  streamerLoginSchema,
} from '../../../../shared/schemas/streamer.ts'
import type { Db } from '../../db/client.ts'
import type { Clock } from '../../lib/clock.ts'
import { notFound, rateLimited, unauthorized } from '../../lib/errors.ts'
import { sha256Token } from '../../lib/hash.ts'
import { createRateWindow } from '../../lib/rateWindow.ts'
import {
  assertCsrfHeader,
  clearSessionCookie,
  issueSessionValue,
  requireStreamer,
  setSessionCookie,
} from '../../plugins/streamerAuth.ts'
import { transcriptionStatus } from '../worker/repo.ts'
import { countInbox, findInboxItem, listInbox, markAired, updateInboxPost } from './inbox.ts'
import { findStreamerByKeyHash, toStreamerPublic } from './repo.ts'

const idParams = z.object({ id: z.uuid() })
const listQuery = z.object({ status: z.enum(REVIEW_STATUSES).default('pending') })

export type AiredEvent = { streamerId: string; postId: string }

export type StreamerRouteDeps = {
  db: Db
  clock: Clock
  sessionKey: string
  secureCookies: boolean
  /** 「今流す」を押したときに呼ぶ（Phase 3.5 のオーバーレイ通知） */
  onAir?(event: AiredEvent): void
}

export function registerStreamerRoutes(app: FastifyInstance, deps: StreamerRouteDeps): void {
  const { db, clock } = deps
  const auth = { db, clock, sessionKey: deps.sessionKey }
  const loginFailures = createRateWindow(
    RATE_LIMITS.streamerLogin.max,
    RATE_LIMITS.streamerLogin.windowMs,
  )

  app.post('/api/streamer/session', async (request, reply) => {
    assertCsrfHeader(request)
    const retry = loginFailures.hit(request.ip, clock.now().getTime())
    if (retry > 0) throw rateLimited(retry)
    const { loginKey } = streamerLoginSchema.parse(request.body)
    const streamer = await findStreamerByKeyHash(db, sha256Token(loginKey))
    if (!streamer) throw unauthorized()
    loginFailures.reset(request.ip)
    setSessionCookie(
      reply,
      issueSessionValue(deps.sessionKey, streamer, clock.now()),
      deps.secureCookies,
    )
    request.log.info({ streamerId: streamer.id }, 'streamer logged in')
    return okEnvelope(toStreamerPublic(streamer))
  })

  app.delete('/api/streamer/session', async (request, reply) => {
    assertCsrfHeader(request)
    clearSessionCookie(reply, deps.secureCookies)
    return okEnvelope({ loggedOut: true })
  })

  app.get('/api/streamer/me', async (request) => {
    const streamer = await requireStreamer(request, auth)
    return okEnvelope({ ...toStreamerPublic(streamer), counts: await countInbox(db, streamer.id) })
  })

  app.get('/api/streamer/inbox', async (request) => {
    const streamer = await requireStreamer(request, auth)
    const { status } = listQuery.parse(request.query)
    return okEnvelope(await listInbox(db, streamer.id, status))
  })

  app.patch('/api/streamer/posts/:id', async (request) => {
    const streamer = await requireStreamer(request, auth)
    const { id } = idParams.parse(request.params)
    const patch = inboxUpdateSchema.parse(request.body)
    if (!(await findInboxItem(db, streamer.id, id))) throw notFound('投稿が見つかりません')
    await updateInboxPost(db, id, patch)
    return okEnvelope(await findInboxItem(db, streamer.id, id))
  })

  app.post('/api/streamer/posts/:id/air', async (request) => {
    const streamer = await requireStreamer(request, auth)
    const { id } = idParams.parse(request.params)
    const { airedRef } = airSchema.parse(request.body ?? {})
    const item = await findInboxItem(db, streamer.id, id)
    if (!item) throw notFound('投稿が見つかりません')
    await markAired(db, id, clock.now(), airedRef ?? null)
    deps.onAir?.({ streamerId: streamer.id, postId: id })
    request.log.info({ streamerId: streamer.id, postId: id }, 'post aired')
    return okEnvelope(await findInboxItem(db, streamer.id, id))
  })

  app.get('/api/streamer/transcription-status', async (request) => {
    const streamer = await requireStreamer(request, auth)
    return okEnvelope(await transcriptionStatus(db, { ownerId: streamer.id }))
  })
}
