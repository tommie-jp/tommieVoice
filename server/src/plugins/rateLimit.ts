import rateLimit from '@fastify/rate-limit'
import type { FastifyInstance } from 'fastify'
import { RATE_LIMITS } from '../../../shared/constants.ts'

export type RateLimits = {
  readonly [K in keyof typeof RATE_LIMITS]: { readonly max: number; readonly windowMs: number }
}

/** 全体の IP 単位制限。ルート別は routeRateLimit() を config に渡す */
export async function registerRateLimit(app: FastifyInstance, limits: RateLimits): Promise<void> {
  await app.register(rateLimit, {
    global: true,
    max: limits.global.max,
    timeWindow: limits.global.windowMs,
    // 静的配信（開発時の /audio）とヘルスチェックは対象外
    allowList: (request) => request.url === '/api/healthz' || request.url.startsWith('/audio/'),
  })
}

export function routeRateLimit(limit: { max: number; windowMs: number }) {
  return { rateLimit: { max: limit.max, timeWindow: limit.windowMs } }
}
