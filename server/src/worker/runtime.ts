import type { PgBoss } from 'pg-boss'
import type { AppConfig } from '../config.ts'
import { createDb, type DbHandle } from '../db/client.ts'
import { QUEUES, startBoss, type TranscodeJob } from '../queue/boss.ts'
import { collectGarbage } from '../queue/gc.ts'
import { markTranscodeFailed, transcodePost } from '../queue/transcode.ts'
import { createAudioStore, type AudioStore } from '../storage/audioStore.ts'
import { startHeartbeat } from './heartbeat.ts'

const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ level: 'info', component: 'worker', msg, ...extra }))
const logError = (msg: string, err: unknown, extra: Record<string, unknown> = {}) =>
  console.error(
    JSON.stringify({
      level: 'error',
      component: 'worker',
      msg,
      error: err instanceof Error ? err.message : String(err),
      ...extra,
    }),
  )

export async function registerJobs(
  boss: PgBoss,
  handle: DbHandle,
  store: AudioStore,
): Promise<void> {
  const transcodeOptions = { batchSize: 1, includeMetadata: true } as const
  await boss.work<TranscodeJob, void, typeof transcodeOptions>(
    QUEUES.transcode,
    transcodeOptions,
    async ([job]) => {
      if (!job) return
      const { postId } = job.data
      try {
        const outcome = await transcodePost({ db: handle.db, store, log }, postId)
        log('transcode done', { postId, outcome })
      } catch (err) {
        logError('transcode failed', err, { postId, retry: job.retryCount })
        if (job.retryCount >= job.retryLimit) {
          await markTranscodeFailed(handle.db, postId)
        }
        throw err
      }
    },
  )
  await boss.work(QUEUES.gc, async () => {
    const result = await collectGarbage(handle.db, store, Date.now())
    log('gc done', result)
  })
  // 毎日 4:30（UTC）に掃除する
  await boss.schedule(QUEUES.gc, '30 4 * * *')
}

/** ワーカープロセス本体 */
export async function startWorker(config: AppConfig, heartbeatFile?: string): Promise<void> {
  const handle = createDb(config.DATABASE_URL)
  await handle.ping()
  const store = createAudioStore(config.AUDIO_DIR)
  await store.ensureDirs()
  const boss = await startBoss(config.DATABASE_URL, 'worker')
  await registerJobs(boss, handle, store)
  const stopHeartbeat = startHeartbeat(heartbeatFile)
  log('started')

  const shutdown = async (signal: string) => {
    log('stopping', { signal })
    stopHeartbeat()
    await boss.stop({ graceful: true, timeout: 20_000 })
    await handle.close()
    process.exit(0)
  }
  process.once('SIGINT', () => void shutdown('SIGINT'))
  process.once('SIGTERM', () => void shutdown('SIGTERM'))
}
