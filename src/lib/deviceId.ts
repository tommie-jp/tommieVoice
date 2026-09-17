import { readStorage, writeStorage } from './storage'

const KEY = 'tv.deviceId'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function randomUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** この端末の匿名 ID。初回に生成して保持する（投稿制限と本人削除の補助に使う） */
export function getDeviceId(): string {
  const stored = readStorage(KEY)
  if (stored && UUID.test(stored)) return stored
  const id = randomUuid()
  writeStorage(KEY, id)
  return id
}
