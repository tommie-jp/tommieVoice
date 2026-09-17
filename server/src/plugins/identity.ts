import type { FastifyRequest } from 'fastify'
import { DEVICE_ID_HEADER } from '../../../shared/constants.ts'
import { deviceIdSchema } from '../../../shared/schemas/post.ts'
import { badRequest } from '../lib/errors.ts'
import { hmacDeviceId, hmacIp } from '../lib/hash.ts'

export type RequestIdentity = { readonly deviceIdHash: string; readonly ipHash: string }

export function ipHashOf(request: FastifyRequest, hashKey: string): string {
  return hmacIp(hashKey, request.ip)
}

/** 投稿系リクエストの識別子（端末 ID ヘッダ必須）。生の値は返さない */
export function identify(request: FastifyRequest, hashKey: string): RequestIdentity {
  const raw = request.headers[DEVICE_ID_HEADER]
  const parsed = deviceIdSchema.safeParse(Array.isArray(raw) ? raw[0] : raw)
  if (!parsed.success) throw badRequest('端末 ID がありません')
  return {
    deviceIdHash: hmacDeviceId(hashKey, parsed.data),
    ipHash: ipHashOf(request, hashKey),
  }
}
