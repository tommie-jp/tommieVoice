import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { okEnvelope } from '../../../../shared/envelope.ts'
import { transcriptResultSchema } from '../../../../shared/schemas/transcript.ts'
import type { Db } from '../../db/client.ts'
import { transcripts } from '../../db/schema/index.ts'
import type { Clock } from '../../lib/clock.ts'
import { forbidden, notFound, unauthorized } from '../../lib/errors.ts'
import { sha256Token, timingSafeEqualStr } from '../../lib/hash.ts'
import { newToken } from '../../lib/ids.ts'
import type { NgWordChecker } from '../../lib/ngWords.ts'
import { triage } from '../../lib/triage.ts'
import { bearerToken } from '../../plugins/adminAuth.ts'
import { readStreamer, assertCsrfHeader } from '../../plugins/streamerAuth.ts'
import type { AudioStore } from '../../storage/audioStore.ts'
import {
  claimJob,
  completeJob,
  failJob,
  findLeasedJob,
  touchWorker,
  transcriptionStatus,
  workerKeyFor,
  type JobScope,
  type LeasedJob,
} from './repo.ts'

export const LEASE_HEADER = 'x-lease-token'
/** 文字起こし結果（本文 2 万字 + 区間 2,000 件）が収まる本文サイズ */
export const RESULT_BODY_LIMIT = 4 * 1024 * 1024

const idParams = z.object({ id: z.uuid() })
const claimSchema = z.object({ workerId: z.string().trim().min(1).max(80) })
const failSchema = z.object({ error: z.string().max(2000) })

export type WorkerRouteDeps = {
  db: Db
  store: AudioStore
  clock: Clock
  adminToken: string
  workerToken?: string
  sessionKey: string
  ngWords: NgWordChecker
}

/** WORKER_TOKEN / 管理トークン = 全話題、配信者セッション = 自分の話題だけ */
async function resolveScope(request: FastifyRequest, deps: WorkerRouteDeps): Promise<JobScope> {
  const token = bearerToken(request)
  if (token !== null) {
    const ok =
      timingSafeEqualStr(token, deps.adminToken) ||
      (deps.workerToken !== undefined && timingSafeEqualStr(token, deps.workerToken))
    if (!ok) throw unauthorized()
    return { ownerId: null }
  }
  assertCsrfHeader(request)
  const streamer = await readStreamer(request, deps)
  if (!streamer) throw unauthorized()
  return { ownerId: streamer.id }
}

async function requireLease(
  request: FastifyRequest,
  deps: WorkerRouteDeps,
  scope: JobScope,
): Promise<LeasedJob> {
  const { id } = idParams.parse(request.params)
  const raw = request.headers[LEASE_HEADER]
  const token = typeof raw === 'string' ? raw : ''
  if (token.length < 20) throw forbidden('リースがありません')
  const job = await findLeasedJob(deps.db, id, sha256Token(token), deps.clock.now())
  if (!job) throw forbidden('リースがありません')
  if (scope.ownerId !== null && job.ownerId !== scope.ownerId) throw forbidden('リースがありません')
  return job
}

export function registerWorkerRoutes(app: FastifyInstance, deps: WorkerRouteDeps): void {
  const { db, clock } = deps

  app.post('/api/worker/jobs/claim', async (request, reply) => {
    const scope = await resolveScope(request, deps)
    const { workerId } = claimSchema.parse(request.body)
    const now = clock.now()
    await touchWorker(db, workerKeyFor(scope, workerId), now)
    const leaseToken = newToken()
    const job = await claimJob(db, scope, {
      workerId,
      leaseTokenHash: sha256Token(leaseToken),
      now,
    })
    if (!job) return reply.status(204).send()
    return okEnvelope({
      id: job.id,
      postId: job.postId,
      leaseToken,
      leaseUntil: job.leaseUntil.toISOString(),
      durationMs: job.durationMs,
      audioPath: `/api/worker/jobs/${job.id}/audio`,
    })
  })

  app.get('/api/worker/jobs/:id/audio', async (request, reply) => {
    const scope = await resolveScope(request, deps)
    const job = await requireLease(request, deps, scope)
    if (!job.publicPath) throw notFound('音声がありません')
    return reply
      .header('content-type', 'audio/mp4')
      .header('cache-control', 'no-store')
      .send(deps.store.openRead('public', job.publicPath))
  })

  app.post('/api/worker/jobs/:id/result', { bodyLimit: RESULT_BODY_LIMIT }, async (request) => {
    const scope = await resolveScope(request, deps)
    const job = await requireLease(request, deps, scope)
    const result = transcriptResultSchema.parse(request.body)
    const now = clock.now()
    const t = triage(result.text, { hasScript: job.hasScript, ngWords: deps.ngWords })
    const values = {
      engine: result.engine,
      model: result.model ?? null,
      language: result.language ?? null,
      text: result.text,
      segments: result.segments,
      summary: t.summary,
      tags: t.tags,
      riskFlags: t.riskFlags,
      createdAt: now,
    }
    await db
      .insert(transcripts)
      .values({ postId: job.postId, ...values })
      .onConflictDoUpdate({ target: transcripts.postId, set: values })
    await completeJob(db, job.id, now)
    return okEnvelope({ jobId: job.id, postId: job.postId, ...t })
  })

  app.post('/api/worker/jobs/:id/fail', async (request) => {
    const scope = await resolveScope(request, deps)
    const job = await requireLease(request, deps, scope)
    const { error } = failSchema.parse(request.body)
    const status = await failJob(db, job, error, clock.now())
    request.log.warn({ jobId: job.id, status }, 'transcription failed')
    return okEnvelope({ jobId: job.id, status })
  })

  app.get('/api/worker/status', async (request) => {
    const scope = await resolveScope(request, deps)
    return okEnvelope(await transcriptionStatus(db, scope))
  })
}
