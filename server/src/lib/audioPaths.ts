import path from 'node:path'
import type { AcceptedAudioMime } from '../../../shared/constants.ts'

const EXTENSIONS: Readonly<Record<AcceptedAudioMime | 'audio/aac-m4a', string>> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/aac-m4a': 'm4a',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const RELATIVE = /^\d{4}\/\d{2}\/[0-9a-f-]{36}\.(webm|m4a|ogg)$/

/** quarantine は管理者が非表示にした公開用ファイルの退避先（nginx は配信しない） */
export type AudioArea = 'original' | 'public' | 'quarantine'

export function extensionFor(mime: AcceptedAudioMime): string {
  return EXTENSIONS[mime]
}

/** 例: 2026/09/<uuid>.webm（original / public 共通の相対パス） */
export function relativeAudioPath(now: Date, id: string, ext: string): string {
  if (!UUID.test(id)) throw new Error('invalid audio id')
  if (!['webm', 'm4a', 'ogg'].includes(ext)) throw new Error('invalid audio extension')
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${yyyy}/${mm}/${id}.${ext}`
}

/** 相対パスを検証して AUDIO_DIR 配下の絶対パスにする。外に出るパスは拒否 */
export function resolveAudioPath(audioDir: string, area: AudioArea, relative: string): string {
  if (!RELATIVE.test(relative)) throw new Error('invalid relative audio path')
  const base = path.resolve(audioDir, area)
  const full = path.resolve(base, relative)
  if (!full.startsWith(base + path.sep)) throw new Error('audio path escapes base dir')
  return full
}

/** 公開 URL（nginx が /audio/public/ を配信する） */
export function publicAudioUrl(relative: string): string {
  return `/audio/public/${relative}`
}
