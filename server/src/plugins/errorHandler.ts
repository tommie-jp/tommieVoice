import type { FastifyError, FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import { errorEnvelope } from '../../../shared/envelope.ts'
import { AppError, type ErrorCode } from '../lib/errors.ts'

type Mapped = { status: number; code: ErrorCode; message: string; retryAfterSeconds?: number }

const STATUS_MAP: Readonly<Record<number, Omit<Mapped, 'status'>>> = {
  400: { code: 'bad_request', message: 'リクエストが不正です' },
  401: { code: 'unauthorized', message: '認証が必要です' },
  403: { code: 'forbidden', message: '操作が許可されていません' },
  404: { code: 'not_found', message: '見つかりません' },
  406: { code: 'bad_request', message: 'リクエストが不正です' },
  413: { code: 'payload_too_large', message: 'ファイルが大きすぎます' },
  415: { code: 'unsupported_media_type', message: '対応していない形式です' },
  429: { code: 'rate_limited', message: '操作が多すぎます。少し待ってから試してください' },
}

function isFastifyError(err: unknown): err is FastifyError {
  return typeof err === 'object' && err !== null && 'statusCode' in err
}

export function mapError(err: unknown): Mapped {
  if (err instanceof AppError) {
    return {
      status: err.statusCode,
      code: err.code,
      message: err.message,
      retryAfterSeconds: err.retryAfterSeconds,
    }
  }
  if (err instanceof ZodError) {
    const first = err.issues[0]
    const where = first?.path.join('.') || '入力'
    return { status: 400, code: 'validation_error', message: `${where} が不正です` }
  }
  if (isFastifyError(err) && typeof err.statusCode === 'number') {
    const known = STATUS_MAP[err.statusCode]
    if (known) return { status: err.statusCode, ...known }
    if (err.statusCode >= 400 && err.statusCode < 500) {
      return { status: err.statusCode, ...STATUS_MAP[400]! }
    }
  }
  return { status: 500, code: 'internal_error', message: 'サーバでエラーが発生しました' }
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((err, request, reply) => {
    const mapped = mapError(err)
    if (mapped.status >= 500) {
      request.log.error({ err }, 'unhandled error')
    } else {
      request.log.info({ code: mapped.code, status: mapped.status }, 'request rejected')
    }
    if (mapped.retryAfterSeconds !== undefined) {
      void reply.header('retry-after', String(mapped.retryAfterSeconds))
    }
    const retry = reply.getHeader('retry-after')
    const retryAfterSeconds =
      mapped.retryAfterSeconds ?? (retry !== undefined ? Number(retry) || undefined : undefined)
    return reply.status(mapped.status).send(
      errorEnvelope({
        code: mapped.code,
        message: mapped.message,
        ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
      }),
    )
  })

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send(errorEnvelope({ code: 'not_found', message: '見つかりません' })),
  )
}
