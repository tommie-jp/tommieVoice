import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createDb } from './client.ts'

export const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../drizzle',
)

export async function runMigrations(connectionString: string): Promise<void> {
  const handle = createDb(connectionString)
  try {
    await migrate(handle.db, { migrationsFolder: MIGRATIONS_DIR })
  } finally {
    await handle.close()
  }
}

// `node server/src/db/migrate.ts` で直接実行されたときだけ走らせる
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL が未設定です')
    process.exit(1)
  }
  runMigrations(url)
    .then(() => console.log('[migrate] 完了'))
    .catch((err: unknown) => {
      console.error('[migrate] 失敗:', err instanceof Error ? err.message : err)
      process.exit(1)
    })
}
