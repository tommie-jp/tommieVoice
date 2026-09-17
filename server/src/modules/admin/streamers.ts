import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify'
import { z } from 'zod'
import { okEnvelope } from '../../../../shared/envelope.ts'
import { streamerCreateSchema } from '../../../../shared/schemas/streamer.ts'
import type { Db } from '../../db/client.ts'
import type { Clock } from '../../lib/clock.ts'
import { notFound } from '../../lib/errors.ts'
import { sha256Token } from '../../lib/hash.ts'
import { newId, newToken } from '../../lib/ids.ts'
import {
  insertStreamer,
  listStreamers,
  rotateStreamerKey,
  setStreamerDisabled,
  toStreamerPublic,
} from '../streamer/repo.ts'

const idParams = z.object({ id: z.uuid() })
const disableSchema = z.object({ disabled: z.boolean() })

export function registerAdminStreamerRoutes(
  app: FastifyInstance,
  deps: { db: Db; clock: Clock; requireAdmin: preHandlerAsyncHookHandler },
): void {
  const { db, clock } = deps
  const guard = { preHandler: deps.requireAdmin }

  app.get('/api/admin/streamers', guard, async () =>
    okEnvelope((await listStreamers(db)).map(toStreamerPublic)),
  )

  /** ログインキーはこの応答でしか返さない。DB にはハッシュだけ残す */
  app.post('/api/admin/streamers', guard, async (request, reply) => {
    const { displayName } = streamerCreateSchema.parse(request.body)
    const loginKey = newToken()
    const row = await insertStreamer(db, {
      id: newId(),
      displayName,
      loginKeyHash: sha256Token(loginKey),
    })
    request.log.info({ streamerId: row.id }, 'streamer issued')
    return reply.status(201).send(okEnvelope({ streamer: toStreamerPublic(row), loginKey }))
  })

  app.post('/api/admin/streamers/:id/rotate-key', guard, async (request) => {
    const { id } = idParams.parse(request.params)
    const loginKey = newToken()
    const row = await rotateStreamerKey(db, id, sha256Token(loginKey))
    if (!row) throw notFound('配信者が見つかりません')
    request.log.info({ streamerId: id }, 'streamer key rotated')
    return okEnvelope({ streamer: toStreamerPublic(row), loginKey })
  })

  app.patch('/api/admin/streamers/:id', guard, async (request) => {
    const { id } = idParams.parse(request.params)
    const { disabled } = disableSchema.parse(request.body)
    const row = await setStreamerDisabled(db, id, disabled, clock.now())
    if (!row) throw notFound('配信者が見つかりません')
    return okEnvelope(toStreamerPublic(row))
  })
}
