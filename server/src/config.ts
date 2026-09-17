import { z } from 'zod'

// 環境変数を起動時に検証する。欠落・不正があれば列挙して起動を止める。
// 値そのものはログに出さない。

const booleanish = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1')

const MIN_KEY_LENGTH = 32

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3100),
  DATABASE_URL: z.url(),
  ADMIN_TOKEN: z.string().min(MIN_KEY_LENGTH),
  HASH_KEY: z.string().min(MIN_KEY_LENGTH),
  SESSION_KEY: z.string().min(MIN_KEY_LENGTH),
  WORKER_TOKEN: z.string().min(MIN_KEY_LENGTH).optional(),
  AUDIO_DIR: z.string().min(1),
  PUBLIC_ORIGIN: z.url(),
  SERVE_AUDIO_FROM_API: booleanish,
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  NG_WORDS_FILE: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** 開発・E2E 用にレート制限を緩める。本番では指定すると起動しない */
  RELAX_RATE_LIMITS: booleanish,
  /** 変換ワーカーを使わず、受け取った音声をそのまま公開する（E2E 用）。本番では指定すると起動しない */
  SYNC_MEDIA: booleanish,
})

export type AppConfig = z.infer<typeof configSchema>

export class ConfigError extends Error {
  readonly keys: readonly string[]
  constructor(keys: readonly string[]) {
    super(`環境変数が不足または不正です: ${keys.join(', ')}`)
    this.name = 'ConfigError'
    this.keys = keys
  }
}

const guardedSchema = configSchema
  .refine((c) => !(c.NODE_ENV === 'production' && c.RELAX_RATE_LIMITS), {
    path: ['RELAX_RATE_LIMITS'],
    message: '本番ではレート制限を緩和できません',
  })
  .refine((c) => !(c.NODE_ENV === 'production' && c.SYNC_MEDIA), {
    path: ['SYNC_MEDIA'],
    message: '本番では変換を省略できません',
  })

export function loadConfig(env: Readonly<Record<string, string | undefined>>): AppConfig {
  const result = guardedSchema.safeParse(env)
  if (result.success) return result.data
  const keys = [...new Set(result.error.issues.map((i) => String(i.path[0] ?? '?')))].sort()
  throw new ConfigError(keys)
}
