import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from './config.ts'

const KEY = 'k'.repeat(32)
const base = {
  DATABASE_URL: 'postgres://u:p@127.0.0.1:5432/db',
  ADMIN_TOKEN: KEY,
  HASH_KEY: KEY,
  SESSION_KEY: KEY,
  AUDIO_DIR: '/tmp/audio',
  PUBLIC_ORIGIN: 'https://voice.example.jp',
}

describe('loadConfig', () => {
  it('applies defaults for optional values', () => {
    const config = loadConfig(base)
    expect(config.PORT).toBe(3100)
    expect(config.HOST).toBe('127.0.0.1')
    expect(config.SERVE_AUDIO_FROM_API).toBe(false)
    expect(config.TRUST_PROXY_HOPS).toBe(0)
  })

  it('throws listing missing variables when DATABASE_URL is absent', () => {
    const { DATABASE_URL: _omit, ...rest } = base
    void _omit
    expect(() => loadConfig(rest)).toThrow(ConfigError)
    try {
      loadConfig(rest)
    } catch (e) {
      expect((e as ConfigError).keys).toEqual(['DATABASE_URL'])
    }
  })

  it('rejects ADMIN_TOKEN shorter than 32 chars without echoing the value', () => {
    const shortToken = 'short-token-value'
    try {
      loadConfig({ ...base, ADMIN_TOKEN: shortToken })
      expect.unreachable()
    } catch (e) {
      expect((e as ConfigError).keys).toEqual(['ADMIN_TOKEN'])
      expect((e as Error).message).not.toContain(shortToken)
    }
  })

  it('parses SERVE_AUDIO_FROM_API true', () => {
    expect(loadConfig({ ...base, SERVE_AUDIO_FROM_API: 'true' }).SERVE_AUDIO_FROM_API).toBe(true)
  })

  it('coerces PORT and TRUST_PROXY_HOPS from strings', () => {
    const config = loadConfig({ ...base, PORT: '8080', TRUST_PROXY_HOPS: '2' })
    expect(config.PORT).toBe(8080)
    expect(config.TRUST_PROXY_HOPS).toBe(2)
  })

  it('refuses skipping conversion in production', () => {
    try {
      loadConfig({ ...base, NODE_ENV: 'production', SYNC_MEDIA: 'true' })
      expect.unreachable()
    } catch (e) {
      expect((e as ConfigError).keys).toEqual(['SYNC_MEDIA'])
    }
    expect(loadConfig({ ...base, SYNC_MEDIA: 'true' }).SYNC_MEDIA).toBe(true)
  })

  it('refuses relaxed rate limits in production', () => {
    try {
      loadConfig({ ...base, NODE_ENV: 'production', RELAX_RATE_LIMITS: 'true' })
      expect.unreachable()
    } catch (e) {
      expect((e as ConfigError).keys).toEqual(['RELAX_RATE_LIMITS'])
    }
    expect(loadConfig({ ...base, RELAX_RATE_LIMITS: 'true' }).RELAX_RATE_LIMITS).toBe(true)
  })
})
