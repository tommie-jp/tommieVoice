// アプリケーションエラー。code はクライアントが分岐に使う安定した識別子。

export type ErrorCode =
  | 'bad_request'
  | 'validation_error'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'rate_limited'
  | 'topic_closed'
  | 'service_unavailable'
  | 'internal_error'

export class AppError extends Error {
  readonly statusCode: number
  readonly code: ErrorCode
  readonly retryAfterSeconds?: number
  constructor(statusCode: number, code: ErrorCode, message: string, retryAfterSeconds?: number) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export const badRequest = (message: string) => new AppError(400, 'bad_request', message)
export const unauthorized = () => new AppError(401, 'unauthorized', '認証が必要です')
export const forbidden = (message = '操作が許可されていません') =>
  new AppError(403, 'forbidden', message)
export const notFound = (message = '見つかりません') => new AppError(404, 'not_found', message)
export const conflict = (message: string) => new AppError(409, 'conflict', message)
export const payloadTooLarge = () =>
  new AppError(413, 'payload_too_large', 'ファイルが大きすぎます')
export const unsupportedMedia = () =>
  new AppError(415, 'unsupported_media_type', '対応していない音声形式です')
export const rateLimited = (retryAfterSeconds: number) =>
  new AppError(
    429,
    'rate_limited',
    '操作が多すぎます。少し待ってから試してください',
    retryAfterSeconds,
  )
