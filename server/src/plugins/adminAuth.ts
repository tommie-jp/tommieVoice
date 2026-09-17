import type { FastifyRequest } from 'fastify'
import { RATE_LIMITS } from '../../../shared/constants.ts'
import type { Clock } from '../lib/clock.ts'
import { rateLimited, unauthorized } from '../lib/errors.ts'
import { timingSafeEqualStr } from '../lib/hash.ts'
import { createRateWindow } from '../lib/rateWindow.ts'

export function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  return token === '' ? null : token
}

/** 管理 API の preHandler。失敗が続く IP は一時的に 429 にする */
export function createAdminGuard(adminToken: string, clock: Clock) {
  const failures = createRateWindow(
    RATE_LIMITS.adminAuthFailure.max,
    RATE_LIMITS.adminAuthFailure.windowMs,
  )
  return async function requireAdmin(request: FastifyRequest): Promise<void> {
    const token = bearerToken(request)
    if (token !== null && timingSafeEqualStr(token, adminToken)) return
    const retryAfter = failures.hit(request.ip, clock.now().getTime())
    if (retryAfter > 0) throw rateLimited(retryAfter)
    throw unauthorized()
  }
}
