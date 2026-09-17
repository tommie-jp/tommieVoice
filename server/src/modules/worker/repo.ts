import { and, eq, gte, max, or, sql } from 'drizzle-orm'
import type { TranscriptionStatus } from '../../../../shared/schemas/transcript.ts'
import type { Db } from '../../db/client.ts'
import { transcriptionJobs, workerHeartbeats } from '../../db/schema/index.ts'

export const LEASE_MS = 15 * 60_000
export const MAX_ATTEMPTS = 3

/** ownerId が null ならすべての話題、指定があればその配信者の話題だけ */
export type JobScope = { ownerId: string | null }

export type ClaimedJob = {
  id: string
  postId: string
  leaseUntil: Date
  durationMs: number | null
  publicPath: string
}

export async function claimJob(
  db: Db,
  scope: JobScope,
  input: { workerId: string; leaseTokenHash: string; now: Date },
): Promise<ClaimedJob | null> {
  const leaseUntil = new Date(input.now.getTime() + LEASE_MS)
  const result = await db.execute<{
    id: string
    post_id: string
    duration_ms: number | null
    public_path: string
  }>(sql`
    UPDATE transcription_jobs j
    SET status = 'leased', worker_id = ${input.workerId}, lease_token_hash = ${input.leaseTokenHash},
        lease_until = ${leaseUntil.toISOString()}::timestamptz, updated_at = ${input.now.toISOString()}::timestamptz
    FROM posts p
    WHERE j.id = (
      SELECT jj.id FROM transcription_jobs jj
      JOIN posts pp ON pp.id = jj.post_id
      JOIN threads tt ON tt.id = pp.thread_id
      JOIN topics tp ON tp.id = tt.topic_id
      WHERE (jj.status = 'queued' OR (jj.status = 'leased' AND jj.lease_until < ${input.now.toISOString()}::timestamptz))
        AND pp.status = 'ready' AND pp.public_path IS NOT NULL
        AND (${scope.ownerId}::uuid IS NULL OR tp.owner_id = ${scope.ownerId}::uuid)
      ORDER BY jj.created_at
      FOR UPDATE OF jj SKIP LOCKED
      LIMIT 1
    ) AND p.id = j.post_id
    RETURNING j.id, j.post_id, p.duration_ms, p.public_path
  `)
  const row = result.rows[0]
  if (!row) return null
  return {
    id: row.id,
    postId: row.post_id,
    leaseUntil,
    durationMs: row.duration_ms,
    publicPath: row.public_path,
  }
}

export type LeasedJob = {
  id: string
  postId: string
  attempts: number
  publicPath: string | null
  ownerId: string | null
  hasScript: boolean
}

/** リースを持っているワーカーのジョブだけを返す */
export async function findLeasedJob(
  db: Db,
  jobId: string,
  leaseTokenHash: string,
  now: Date,
): Promise<LeasedJob | null> {
  const result = await db.execute<{
    id: string
    post_id: string
    attempts: number
    public_path: string | null
    owner_id: string | null
    has_script: boolean
  }>(sql`
    SELECT j.id, j.post_id, j.attempts, p.public_path, tp.owner_id, (tp.script_text IS NOT NULL) AS has_script
    FROM transcription_jobs j
    JOIN posts p ON p.id = j.post_id
    JOIN threads t ON t.id = p.thread_id
    JOIN topics tp ON tp.id = t.topic_id
    WHERE j.id = ${jobId} AND j.status = 'leased'
      AND j.lease_token_hash = ${leaseTokenHash}
      AND j.lease_until >= ${now.toISOString()}::timestamptz
  `)
  const row = result.rows[0]
  return row
    ? {
        id: row.id,
        postId: row.post_id,
        attempts: row.attempts,
        publicPath: row.public_path,
        ownerId: row.owner_id,
        hasScript: row.has_script,
      }
    : null
}

export async function completeJob(db: Db, jobId: string, now: Date): Promise<void> {
  await db
    .update(transcriptionJobs)
    .set({
      status: 'done',
      leaseTokenHash: null,
      leaseUntil: null,
      updatedAt: now,
      lastError: null,
    })
    .where(eq(transcriptionJobs.id, jobId))
}

export async function failJob(
  db: Db,
  job: LeasedJob,
  error: string,
  now: Date,
): Promise<'queued' | 'failed'> {
  const attempts = job.attempts + 1
  const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'queued'
  await db
    .update(transcriptionJobs)
    .set({
      status,
      attempts,
      lastError: error.slice(0, 500),
      leaseTokenHash: null,
      leaseUntil: null,
      updatedAt: now,
    })
    .where(eq(transcriptionJobs.id, job.id))
  return status
}

export async function touchWorker(db: Db, workerKey: string, now: Date): Promise<void> {
  await db
    .insert(workerHeartbeats)
    .values({ workerKey, seenAt: now })
    .onConflictDoUpdate({ target: workerHeartbeats.workerKey, set: { seenAt: now } })
}

export function workerKeyFor(scope: JobScope, workerId: string): string {
  return scope.ownerId ? `streamer:${scope.ownerId}` : `worker:${workerId}`
}

export async function transcriptionStatus(db: Db, scope: JobScope): Promise<TranscriptionStatus> {
  const counts = await db.execute<{ status: string; n: number }>(sql`
    SELECT j.status, count(*)::int AS n
    FROM transcription_jobs j
    JOIN posts p ON p.id = j.post_id
    JOIN threads t ON t.id = p.thread_id
    JOIN topics tp ON tp.id = t.topic_id
    WHERE p.status IN ('processing', 'ready')
      AND (${scope.ownerId}::uuid IS NULL OR tp.owner_id = ${scope.ownerId}::uuid)
    GROUP BY j.status
  `)
  const by = Object.fromEntries(counts.rows.map((r) => [r.status, r.n]))
  const keyFilter = scope.ownerId
    ? or(
        eq(workerHeartbeats.workerKey, `streamer:${scope.ownerId}`),
        sql`${workerHeartbeats.workerKey} LIKE 'worker:%'`,
      )
    : gte(workerHeartbeats.seenAt, new Date(0))
  const [seen] = await db
    .select({ at: max(workerHeartbeats.seenAt) })
    .from(workerHeartbeats)
    .where(and(keyFilter))
  return {
    waiting: by.queued ?? 0,
    leased: by.leased ?? 0,
    failed: by.failed ?? 0,
    lastWorkerSeenAt: seen?.at ? seen.at.toISOString() : null,
  }
}
