import type { ZodType } from 'zod'
import { DEVICE_ID_HEADER } from '../../shared/constants.ts'
import { parseEnvelope, type PageMeta } from '../../shared/envelope.ts'
import { getDeviceId } from '../lib/deviceId'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly retryAfterSeconds?: number
  constructor(status: number, code: string, message: string, retryAfterSeconds?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  json?: unknown
  form?: FormData
  headers?: Record<string, string>
  signal?: AbortSignal
}

export type ApiResult<T> = { data: T; meta?: PageMeta }

let fetchImpl: typeof fetch = (...args) => fetch(...args)

/** テスト用に fetch を差し替える */
export function setFetch(impl: typeof fetch): void {
  fetchImpl = impl
}

function buildInit(opts: RequestOptions): RequestInit {
  const headers: Record<string, string> = {
    accept: 'application/json',
    [DEVICE_ID_HEADER]: getDeviceId(),
    ...opts.headers,
  }
  let body: BodyInit | undefined
  if (opts.form) {
    body = opts.form
  } else if (opts.json !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(opts.json)
  }
  return {
    method: opts.method ?? 'GET',
    headers,
    body,
    signal: opts.signal,
    credentials: 'same-origin',
  }
}

export async function apiRequest<T>(
  path: string,
  schema: ZodType<T>,
  opts: RequestOptions = {},
): Promise<ApiResult<T>> {
  let res: Response
  try {
    res = await fetchImpl(path, buildInit(opts))
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(
      0,
      'network_error',
      '通信できませんでした。電波の良い場所で再度お試しください',
    )
  }
  let json: unknown
  try {
    json = await res.json()
  } catch {
    throw new ApiError(res.status, 'bad_response', `サーバの応答を読めませんでした (${res.status})`)
  }
  let envelope: ReturnType<typeof parseEnvelope>
  try {
    envelope = parseEnvelope(json)
  } catch {
    throw new ApiError(res.status, 'bad_response', `サーバの応答が不正です (${res.status})`)
  }
  if (!envelope.ok) {
    const { code, message, retryAfterSeconds } = envelope.error
    throw new ApiError(res.status, code, message, retryAfterSeconds)
  }
  return { data: schema.parse(envelope.data), meta: envelope.meta }
}

function waitText(seconds: number): string {
  if (seconds < 60) return `あと約 ${seconds} 秒`
  return `あと約 ${Math.ceil(seconds / 60)} 分`
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'rate_limited' && err.retryAfterSeconds !== undefined) {
      return `${err.message}（${waitText(err.retryAfterSeconds)}）`
    }
    return err.message
  }
  if (err instanceof Error && err.message) return err.message
  return 'エラーが発生しました'
}
