import { z } from 'zod'
import { badRequest } from './errors.ts'

const cursorSchema = z.object({ t: z.iso.datetime({ offset: true }), id: z.uuid() })
export type Cursor = { t: string; id: string }

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

export function decodeCursor(raw: string | undefined): Cursor | null {
  if (raw === undefined || raw === '') return null
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')))
  } catch {
    throw badRequest('cursor が不正です')
  }
}
