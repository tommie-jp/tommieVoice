/** 固定幅ウィンドウのインメモリ回数制限（単一プロセス前提） */
export type RateWindow = {
  /** 1 回分を記録し、上限内なら 0、超過なら再試行までの秒数を返す */
  hit(key: string, now: number): number
  reset(key: string): void
}

const SWEEP_EVERY = 500

export function createRateWindow(max: number, windowMs: number): RateWindow {
  const buckets = new Map<string, { count: number; resetAt: number }>()
  let calls = 0

  const sweep = (now: number) => {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key)
    }
  }

  return {
    hit(key, now) {
      calls += 1
      if (calls % SWEEP_EVERY === 0) sweep(now)
      const current = buckets.get(key)
      const bucket =
        current && current.resetAt > now
          ? { count: current.count + 1, resetAt: current.resetAt }
          : { count: 1, resetAt: now + windowMs }
      buckets.set(key, bucket)
      return bucket.count > max ? Math.ceil((bucket.resetAt - now) / 1000) : 0
    },
    reset(key) {
      buckets.delete(key)
    },
  }
}
