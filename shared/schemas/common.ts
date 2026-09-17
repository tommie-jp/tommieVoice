import { z } from 'zod'

/** 前後の空白を除き、空なら null にする任意文字列 */
export function optionalText(max: number) {
  return z
    .string()
    .optional()
    .nullable()
    .transform((v) => {
      const trimmed = (v ?? '').trim()
      return trimmed === '' ? null : trimmed
    })
    .pipe(z.string().max(max).nullable())
}

/** 前後の空白を除いた必須文字列 */
export function requiredText(max: number) {
  return z.string().trim().min(1).max(max)
}

export const uuidSchema = z.uuid()
export const isoDateSchema = z.iso.datetime({ offset: true })
