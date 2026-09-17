import { PgBoss } from 'pg-boss'

export const QUEUES = {
  transcode: 'transcode',
  gc: 'gc',
} as const

export type TranscodeJob = { postId: string }

export const TRANSCODE_RETRY_LIMIT = 2

export type BossRole = 'api' | 'worker'

/**
 * pg-boss を起動してキューを用意する。
 * API は投入だけ行うので監視・定期実行を worker 側に寄せる。
 */
export async function startBoss(connectionString: string, role: BossRole): Promise<PgBoss> {
  const boss = new PgBoss({
    connectionString,
    schema: 'pgboss',
    max: 3,
    application_name: `tommievoice-${role}`,
    supervise: role === 'worker',
    schedule: role === 'worker',
  })
  boss.on('error', (err: unknown) => console.error(`[pg-boss:${role}]`, err))
  await boss.start()
  await boss.createQueue(QUEUES.transcode, {
    retryLimit: TRANSCODE_RETRY_LIMIT,
    retryDelay: 5,
    retryBackoff: true,
    expireInSeconds: 300,
    deleteAfterSeconds: 7 * 24 * 3600,
  })
  await boss.createQueue(QUEUES.gc, { retryLimit: 0, expireInSeconds: 600 })
  return boss
}
