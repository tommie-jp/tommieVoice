import { RATE_LIMITS, RELAXED_RATE_LIMITS } from '../../shared/constants.ts'
import { buildApp } from './app.ts'
import { ConfigError, loadConfig } from './config.ts'
import { createDb } from './db/client.ts'
import { systemClock } from './lib/clock.ts'
import { loadNgWords } from './lib/ngWords.ts'
import { startBoss } from './queue/boss.ts'
import { createQueuePipeline } from './queue/queuePipeline.ts'

async function main(): Promise<void> {
  const config = loadConfig(process.env)
  const handle = createDb(config.DATABASE_URL)
  // 変換はワーカーに任せる。E2E など ffmpeg ワーカー無しで動かす場合は即時公開（コピー）にする
  const boss = config.SYNC_MEDIA ? null : await startBoss(config.DATABASE_URL, 'api')
  const app = await buildApp({
    config,
    db: handle.db,
    clock: systemClock,
    pingDb: () => handle.ping(),
    limits: config.RELAX_RATE_LIMITS ? RELAXED_RATE_LIMITS : RATE_LIMITS,
    ngWords: await loadNgWords(config.NG_WORDS_FILE),
    ...(boss ? { media: createQueuePipeline(boss) } : {}),
  })

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down')
    await app.close()
    await boss?.stop({ graceful: true, timeout: 10_000 })
    await handle.close()
    process.exit(0)
  }
  process.once('SIGINT', () => void shutdown('SIGINT'))
  process.once('SIGTERM', () => void shutdown('SIGTERM'))

  await app.listen({ host: config.HOST, port: config.PORT })
}

main().catch((err: unknown) => {
  if (err instanceof ConfigError) {
    console.error(`[api] ${err.message}`)
  } else {
    console.error('[api] 起動に失敗しました:', err)
  }
  process.exit(1)
})
