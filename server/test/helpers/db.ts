import type pg from 'pg'

const TABLES = [
  'worker_heartbeats',
  'transcription_jobs',
  'transcripts',
  'reports',
  'posts',
  'threads',
  'topics',
  'streamers',
] as const

/** 各テストの前に全テーブルを空にする（マイグレーションは globalSetup で適用済み） */
export async function truncateAll(pool: pg.Pool, extra: readonly string[] = []): Promise<void> {
  const names = [...extra, ...TABLES].map((t) => `"${t}"`).join(', ')
  await pool.query(`TRUNCATE ${names} RESTART IDENTITY CASCADE`)
}
