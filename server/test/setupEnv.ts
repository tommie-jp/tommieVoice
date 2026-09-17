import { TEST_DATABASE_URL } from './testDb.ts'

// テスト専用のダミー値。本番の値ではない。
const DUMMY_KEY = 'test-only-key-0123456789abcdef0123456789'

process.env.NODE_ENV = 'test'
process.env.DATABASE_URL ??= TEST_DATABASE_URL
process.env.ADMIN_TOKEN ??= `admin-${DUMMY_KEY}`
process.env.HASH_KEY ??= `hash-${DUMMY_KEY}`
process.env.SESSION_KEY ??= `session-${DUMMY_KEY}`
process.env.WORKER_TOKEN ??= `worker-${DUMMY_KEY}`
process.env.PUBLIC_ORIGIN ??= 'http://localhost:5173'
process.env.AUDIO_DIR ??= '/tmp/tommievoice-test-audio'
