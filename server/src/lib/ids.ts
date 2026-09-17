import { randomBytes, randomUUID } from 'node:crypto'

export function newId(): string {
  return randomUUID()
}

/** URL に載せても安全なランダムトークン（既定 32 バイト = 256 bit） */
export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}
