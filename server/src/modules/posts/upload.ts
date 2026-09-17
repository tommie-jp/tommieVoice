import type { FastifyRequest } from 'fastify'
import { MAX_UPLOAD_BYTES } from '../../../../shared/constants.ts'
import { badRequest, unsupportedMedia } from '../../lib/errors.ts'
import type { AudioStore, ReceivedFile } from '../../storage/audioStore.ts'

export const AUDIO_FIELD = 'audio'
const MAX_FIELDS = 10
const MAX_FIELD_BYTES = 2_000

export type AcceptedUpload = {
  file: ReceivedFile & { mime: NonNullable<ReceivedFile['mime']> }
  fields: Record<string, string>
}

export const multipartLimits = {
  fileSize: MAX_UPLOAD_BYTES,
  files: 1,
  fields: MAX_FIELDS,
  fieldSize: MAX_FIELD_BYTES,
  parts: MAX_FIELDS + 1,
} as const

/**
 * multipart を読み、音声は一時ファイルへ、テキストはフィールドへ集める。
 * 音声でない・大きすぎる・欠けている場合は一時ファイルを消してから例外を投げる。
 */
export async function readAudioUpload(
  request: FastifyRequest,
  store: AudioStore,
): Promise<AcceptedUpload> {
  if (!request.isMultipart()) throw badRequest('multipart/form-data で送ってください')
  const fields: Record<string, string> = {}
  let file: ReceivedFile | null = null
  try {
    for await (const part of request.parts({ limits: multipartLimits })) {
      if (part.type === 'field') {
        if (typeof part.value === 'string') fields[part.fieldname] = part.value
        continue
      }
      if (part.fieldname !== AUDIO_FIELD || file !== null) {
        part.file.resume()
        throw badRequest('音声ファイルは audio フィールドで 1 つだけ送ってください')
      }
      // 上限超過は @fastify/multipart がストリームのエラー（413）として投げる
      file = await store.receive(part.file)
    }
  } catch (err) {
    if (file) await store.discard(file.tmpPath)
    throw err
  }
  if (!file) throw badRequest('音声ファイルがありません')
  if (file.mime === null || file.sizeBytes === 0) {
    await store.discard(file.tmpPath)
    throw unsupportedMedia()
  }
  return { file: { ...file, mime: file.mime }, fields }
}
