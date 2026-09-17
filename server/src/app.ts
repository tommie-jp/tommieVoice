import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import Fastify, { type FastifyInstance } from 'fastify'
import { RATE_LIMITS } from '../../shared/constants.ts'
import type { AppConfig } from './config.ts'
import type { Db } from './db/client.ts'
import type { Clock } from './lib/clock.ts'
import { registerHealthRoutes } from './modules/health/routes.ts'
import { createCopyPipeline, type MediaPipeline } from './modules/posts/media.ts'
import { registerPostRoutes } from './modules/posts/routes.ts'
import { registerShareRoutes } from './modules/share/routes.ts'
import { multipartLimits } from './modules/posts/upload.ts'
import { registerThreadRoutes } from './modules/threads/routes.ts'
import { registerTopicRoutes } from './modules/topics/routes.ts'
import { registerAdminPostRoutes } from './modules/admin/posts.ts'
import { registerReportRoutes } from './modules/reports/routes.ts'
import { registerAdminStreamerRoutes } from './modules/admin/streamers.ts'
import { registerStreamerRoutes, type AiredEvent } from './modules/streamer/routes.ts'
import { registerTranscriptRoutes } from './modules/transcripts/routes.ts'
import { registerWorkerRoutes } from './modules/worker/routes.ts'
import { createAirNotifier, registerOverlayRoutes } from './modules/overlay/routes.ts'
import { createSseHub, type SseHub } from './modules/overlay/sseHub.ts'
import { createNgWordChecker } from './lib/ngWords.ts'
import { createAdminGuard } from './plugins/adminAuth.ts'
import { registerErrorHandling } from './plugins/errorHandler.ts'
import { registerRateLimit, type RateLimits } from './plugins/rateLimit.ts'
import { registerAudioServing } from './plugins/serveAudio.ts'
import { createAudioStore, type AudioStore } from './storage/audioStore.ts'

export type AppDeps = {
  readonly config: AppConfig
  readonly db: Db
  readonly clock: Clock
  pingDb(): Promise<void>
  readonly store?: AudioStore
  readonly media?: MediaPipeline
  readonly limits?: RateLimits
  readonly ngWords?: readonly string[]
  onAir?(event: AiredEvent): void
  readonly overlayHub?: SseHub
  readonly overlayPingMs?: number
}

const BODY_LIMIT_BYTES = 64 * 1024

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config, db, clock } = deps
  const store = deps.store ?? createAudioStore(config.AUDIO_DIR)
  const media = deps.media ?? createCopyPipeline(store)
  const limits = deps.limits ?? RATE_LIMITS
  await store.ensureDirs()

  const app = Fastify({
    logger:
      config.NODE_ENV === 'test'
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-delete-token"]',
              'req.headers["x-device-id"]',
            ],
          },
    // nginx の段数ぶんだけ X-Forwarded-For を信頼する（0 なら信頼しない）
    trustProxy: (_address: string, hop: number) => hop < config.TRUST_PROXY_HOPS,
    bodyLimit: BODY_LIMIT_BYTES,
    // SSE（オーバーレイ）の接続が残っていても停止できるようにする
    forceCloseConnections: true,
  })

  registerErrorHandling(app)
  await registerRateLimit(app, limits)
  await app.register(multipart, { limits: multipartLimits })
  await app.register(cookie)
  if (config.SERVE_AUDIO_FROM_API) await registerAudioServing(app, config.AUDIO_DIR)

  const requireAdmin = createAdminGuard(config.ADMIN_TOKEN, clock)
  const hub = deps.overlayHub ?? createSseHub()
  const notifyOverlay = createAirNotifier(db, hub)
  const ngWords = createNgWordChecker(deps.ngWords ?? [])
  const postDeps = { db, store, media, clock, hashKey: config.HASH_KEY, limits, ngWords }

  registerHealthRoutes(app, deps)
  registerTopicRoutes(app, { db, requireAdmin })
  registerThreadRoutes(app, postDeps)
  registerPostRoutes(app, { db, store })
  registerReportRoutes(app, { db, clock, hashKey: config.HASH_KEY, limits })
  registerAdminPostRoutes(app, { db, store, clock, requireAdmin })
  registerAdminStreamerRoutes(app, { db, clock, requireAdmin })
  registerStreamerRoutes(app, {
    db,
    clock,
    sessionKey: config.SESSION_KEY,
    secureCookies: config.NODE_ENV === 'production',
    onAir: (event) => {
      notifyOverlay(event)
      deps.onAir?.(event)
    },
  })
  registerOverlayRoutes(app, {
    db,
    clock,
    hub,
    sessionKey: config.SESSION_KEY,
    pingMs: deps.overlayPingMs,
  })
  registerWorkerRoutes(app, {
    db,
    store,
    clock,
    ngWords,
    adminToken: config.ADMIN_TOKEN,
    workerToken: config.WORKER_TOKEN,
    sessionKey: config.SESSION_KEY,
  })
  registerTranscriptRoutes(app, { db })
  registerShareRoutes(app, { db, origin: config.PUBLIC_ORIGIN.replace(/\/$/, '') })

  await app.ready()
  return app
}
