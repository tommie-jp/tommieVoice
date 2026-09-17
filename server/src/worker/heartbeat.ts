import { writeFile } from 'node:fs/promises'

export const HEARTBEAT_INTERVAL_MS = 30_000

/** compose の healthcheck 用に一定間隔でファイルを更新する。戻り値で停止する */
export function startHeartbeat(
  file: string | undefined,
  intervalMs: number = HEARTBEAT_INTERVAL_MS,
  onError: (err: unknown) => void = (err) => console.error('[worker] heartbeat failed:', err),
): () => void {
  if (!file) return () => {}
  const beat = () => {
    writeFile(file, String(Date.now())).catch(onError)
  }
  beat()
  const timer = setInterval(beat, intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}
