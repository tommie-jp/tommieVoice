import { z } from 'zod'

// API レスポンスの共通エンベロープ: { ok, data, error, meta }

export const errorBodySchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  retryAfterSeconds: z.number().int().nonnegative().optional(),
})
export type ErrorBody = z.infer<typeof errorBodySchema>

export const pageMetaSchema = z.object({
  nextCursor: z.string().nullable(),
})
export type PageMeta = z.infer<typeof pageMetaSchema>

export type OkEnvelope<T> = { ok: true; data: T; error: null; meta?: PageMeta }
export type ErrorEnvelope = { ok: false; data: null; error: ErrorBody }
export type Envelope<T> = OkEnvelope<T> | ErrorEnvelope

export function okEnvelope<T>(data: T, meta?: PageMeta): OkEnvelope<T> {
  return meta === undefined
    ? { ok: true, data, error: null }
    : { ok: true, data, error: null, meta }
}

export function errorEnvelope(error: ErrorBody): ErrorEnvelope {
  return { ok: false, data: null, error: errorBodySchema.parse(error) }
}

const envelopeShape = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    data: z.unknown(),
    error: z.null(),
    meta: pageMetaSchema.optional(),
  }),
  z.object({ ok: z.literal(false), data: z.null(), error: errorBodySchema }),
])

/** 受信した JSON をエンベロープとして検証する（data の中身は呼び出し側で検証） */
export function parseEnvelope(json: unknown): Envelope<unknown> {
  return envelopeShape.parse(json) as Envelope<unknown>
}
