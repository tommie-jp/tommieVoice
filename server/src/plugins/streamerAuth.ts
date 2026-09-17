import { createHmac } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '../../../shared/constants.ts'
import type { Db } from '../db/client.ts'
import type { StreamerRow } from '../db/schema/index.ts'
import type { Clock } from '../lib/clock.ts'
import { forbidden, unauthorized } from '../lib/errors.ts'
import { timingSafeEqualStr } from '../lib/hash.ts'
import { findActiveStreamer } from '../modules/streamer/repo.ts'

export const SESSION_COOKIE = 'tv_streamer'
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000

// cookie の中身: <streamerId>.<sessionVersion>.<発行時刻ms>.<署名>
function sign(key: string, payload: string): string {
  return createHmac('sha256', key).update(`streamer-session:${payload}`).digest('base64url')
}

export function issueSessionValue(key: string, streamer: StreamerRow, now: Date): string {
  const payload = `${streamer.id}.${streamer.sessionVersion}.${now.getTime()}`
  return `${payload}.${sign(key, payload)}`
}

export type ParsedSession = { streamerId: string; version: number; issuedAt: number }

export function parseSessionValue(
  key: string,
  value: string | undefined,
  now: Date,
): ParsedSession | null {
  if (!value) return null
  const parts = value.split('.')
  if (parts.length !== 4) return null
  const [id, version, issued, mac] = parts as [string, string, string, string]
  if (!timingSafeEqualStr(mac, sign(key, `${id}.${version}.${issued}`))) return null
  const issuedAt = Number(issued)
  if (!Number.isSafeInteger(issuedAt) || now.getTime() - issuedAt > SESSION_TTL_MS) return null
  return { streamerId: id, version: Number(version), issuedAt }
}

export function sessionCookieOptions(secure: boolean) {
  return {
    path: '/api',
    httpOnly: true,
    secure,
    sameSite: 'strict' as const,
    maxAge: SESSION_TTL_MS / 1000,
  }
}

export function setSessionCookie(reply: FastifyReply, value: string, secure: boolean): void {
  void reply.setCookie(SESSION_COOKIE, value, sessionCookieOptions(secure))
}

export function clearSessionCookie(reply: FastifyReply, secure: boolean): void {
  void reply.clearCookie(SESSION_COOKIE, sessionCookieOptions(secure))
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** 配信者セッションを読む。無効なら null（例外は投げない） */
export async function readStreamer(
  request: FastifyRequest,
  deps: { db: Db; clock: Clock; sessionKey: string },
): Promise<StreamerRow | null> {
  const parsed = parseSessionValue(
    deps.sessionKey,
    request.cookies[SESSION_COOKIE],
    deps.clock.now(),
  )
  if (!parsed) return null
  const streamer = await findActiveStreamer(deps.db, parsed.streamerId)
  if (!streamer || streamer.sessionVersion !== parsed.version) return null
  return streamer
}

/** 変更系は独自ヘッダ必須（SameSite=Strict と二重の CSRF 対策） */
export function assertCsrfHeader(request: FastifyRequest): void {
  if (SAFE_METHODS.has(request.method)) return
  if (request.headers[CSRF_HEADER] !== CSRF_HEADER_VALUE) throw forbidden('不正なリクエストです')
}

export async function requireStreamer(
  request: FastifyRequest,
  deps: { db: Db; clock: Clock; sessionKey: string },
): Promise<StreamerRow> {
  assertCsrfHeader(request)
  const streamer = await readStreamer(request, deps)
  if (!streamer) throw unauthorized()
  return streamer
}
