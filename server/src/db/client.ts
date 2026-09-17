import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema/index.ts'

export type Db = NodePgDatabase<typeof schema>

export type DbHandle = {
  readonly db: Db
  readonly pool: pg.Pool
  ping(): Promise<void>
  close(): Promise<void>
}

const POOL_MAX = 10
const PING_TIMEOUT_MS = 2_000

export function createDb(connectionString: string): DbHandle {
  const pool = new pg.Pool({ connectionString, max: POOL_MAX })
  pool.on('error', (err) => {
    // アイドル接続の切断はプロセスを落とさず記録だけする
    console.error('[db] idle client error:', err.message)
  })
  const db = drizzle(pool, { schema })
  return {
    db,
    pool,
    async ping() {
      await pool.query({ text: 'SELECT 1', query_timeout: PING_TIMEOUT_MS } as pg.QueryConfig)
    },
    async close() {
      await pool.end()
    },
  }
}
