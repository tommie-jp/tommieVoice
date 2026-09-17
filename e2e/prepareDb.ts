import pg from 'pg'
import { runMigrations } from '../server/src/db/migrate.ts'

export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  (process.env.TEST_DATABASE_URL
    ? process.env.TEST_DATABASE_URL.replace(/\/[^/]+$/, '/tommievoice_e2e')
    : 'postgres://tommievoice:tommievoice-dev@127.0.0.1:5436/tommievoice_e2e')

export async function prepareDb(): Promise<void> {
  const url = new URL(E2E_DATABASE_URL)
  const name = url.pathname.slice(1)
  const adminUrl = new URL(E2E_DATABASE_URL)
  adminUrl.pathname = '/postgres'
  const admin = new pg.Client({ connectionString: adminUrl.toString() })
  await admin.connect()
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
    await admin.query(`CREATE DATABASE ${name}`)
  } finally {
    await admin.end()
  }
  await runMigrations(E2E_DATABASE_URL)
}

// Playwright は globalSetup より先に webServer を起動するので、API 起動コマンドの前段で実行する
if (import.meta.url === `file://${process.argv[1]}`) {
  prepareDb().catch((err: unknown) => {
    console.error('[e2e] DB の準備に失敗しました:', err)
    process.exit(1)
  })
}
