import pg from 'pg'
import { describe, expect, it } from 'vitest'
import { TEST_DATABASE_URL } from '../../test/testDb.ts'
import { runMigrations } from './migrate.ts'

describe('runMigrations', () => {
  it('has created all phase-1 tables', async () => {
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL })
    await client.connect()
    try {
      const res = await client.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1",
      )
      expect(res.rows.map((r) => r.table_name)).toEqual(
        expect.arrayContaining([
          'posts',
          'reports',
          'streamers',
          'threads',
          'topics',
          'transcription_jobs',
          'transcripts',
          'worker_heartbeats',
        ]),
      )
    } finally {
      await client.end()
    }
  })

  it('0001 adds default mode board to topics', async () => {
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL })
    await client.connect()
    try {
      const res = await client.query<{ column_default: string }>(
        "SELECT column_default FROM information_schema.columns WHERE table_name = 'topics' AND column_name = 'mode'",
      )
      expect(res.rows[0]?.column_default).toContain('board')
    } finally {
      await client.end()
    }
  })

  it('is idempotent when run twice', async () => {
    await expect(runMigrations(TEST_DATABASE_URL)).resolves.toBeUndefined()
  })
})
