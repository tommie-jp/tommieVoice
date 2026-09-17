export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return '-:--'
  const total = Math.round(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** 「3分前」「2時間前」「9/18」の形 */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const diff = now - t
  if (diff < MINUTE) return 'たった今'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}分前`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}時間前`
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}日前`
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
