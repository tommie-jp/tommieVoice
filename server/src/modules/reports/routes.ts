import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { okEnvelope } from '../../../../shared/envelope.ts'
import { reportCreateSchema } from '../../../../shared/schemas/report.ts'
import type { Db } from '../../db/client.ts'
import type { Clock } from '../../lib/clock.ts'
import { conflict, notFound } from '../../lib/errors.ts'
import { ipHashOf } from '../../plugins/identity.ts'
import { routeRateLimit, type RateLimits } from '../../plugins/rateLimit.ts'
import { findVisiblePost } from '../posts/repo.ts'
import { insertReport } from './repo.ts'

const idParams = z.object({ id: z.uuid() })

export type ReportRouteDeps = { db: Db; clock: Clock; hashKey: string; limits: RateLimits }

export function registerReportRoutes(app: FastifyInstance, deps: ReportRouteDeps): void {
  const { db, clock, hashKey } = deps

  app.post(
    '/api/posts/:id/reports',
    { config: routeRateLimit(deps.limits.report) },
    async (request, reply) => {
      const { id } = idParams.parse(request.params)
      const { reason } = reportCreateSchema.parse(request.body)
      if (!(await findVisiblePost(db, id))) throw notFound('投稿が見つかりません')
      const created = await insertReport(db, {
        postId: id,
        reason,
        ipHash: ipHashOf(request, hashKey),
        now: clock.now(),
      })
      if (!created) throw conflict('この投稿はすでに通報済みです')
      request.log.info({ postId: id, reason }, 'post reported')
      return reply.status(201).send(okEnvelope({ postId: id, reported: true }))
    },
  )
}
