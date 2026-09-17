import { loadConfig, ConfigError } from '../config.ts'
import { startWorker } from './runtime.ts'

startWorker(loadConfig(process.env), process.env.HEARTBEAT_FILE).catch((err: unknown) => {
  if (err instanceof ConfigError) {
    console.error(`[worker] ${err.message}`)
  } else {
    console.error('[worker] 起動に失敗しました:', err)
  }
  process.exit(1)
})
