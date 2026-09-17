import type { FastifyInstance } from 'fastify'
import { APP_COMMIT_COUNTER, APP_VERSION } from '../../../../shared/appVersion.ts'
import { errorEnvelope, okEnvelope } from '../../../../shared/envelope.ts'

export type HealthDeps = { pingDb(): Promise<void> }

export function registerHealthRoutes(app: FastifyInstance, deps: HealthDeps): void {
  app.get('/api/healthz', async (request, reply) => {
    try {
      await deps.pingDb()
    } catch (err) {
      request.log.warn({ err }, 'healthz: database unreachable')
      return reply
        .status(503)
        .send(
          errorEnvelope({ code: 'service_unavailable', message: 'データベースに接続できません' }),
        )
    }
    return okEnvelope({ status: 'ok', version: APP_VERSION, commit: APP_COMMIT_COUNTER })
  })
}
