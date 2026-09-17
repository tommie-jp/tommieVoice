import pg from 'pg'
import { runMigrations } from '../src/db/migrate.ts'
import { TEST_DATABASE_URL, adminUrlFor, databaseNameOf } from './testDb.ts'

const IDENT = /^[a-z_][a-z0-9_]*$/

async function ensureDatabase(url: string): Promise<void> {
  const name = databaseNameOf(url)
  if (!IDENT.test(name)) throw new Error(`テスト DB 名が不正です: ${name}`)
  const admin = new pg.Client({ connectionString: adminUrlFor(url) })
  try {
    await admin.connect()
  } catch (err) {
    throw new Error(
      `テスト用 PostgreSQL に接続できません。\`npm run db:up\` で起動してください (${(err as Error).message})`,
    )
  }
  try {
    const found = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])
    if (found.rowCount === 0) await admin.query(`CREATE DATABASE ${name}`)
  } finally {
    await admin.end()
  }
}

async function resetSchemas(url: string): Promise<void> {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    await client.query(`
      DROP SCHEMA IF EXISTS public CASCADE;
      DROP SCHEMA IF EXISTS drizzle CASCADE;
      DROP SCHEMA IF EXISTS pgboss CASCADE;
      CREATE SCHEMA public;
    `)
  } finally {
    await client.end()
  }
}

export default async function setup(): Promise<void> {
  await ensureDatabase(TEST_DATABASE_URL)
  await resetSchemas(TEST_DATABASE_URL)
  await runMigrations(TEST_DATABASE_URL)
}
