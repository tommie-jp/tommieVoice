import type { AcceptedAudioMime } from '../../../shared/constants.ts'

export const SNIFF_BYTES = 12

/** 先頭バイトからコンテナ形式を判定する。拡張子や Content-Type は信用しない */
export function sniffAudio(head: Uint8Array): AcceptedAudioMime | null {
  if (head.length < 4) return null
  // EBML (WebM / Matroska)
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    return 'audio/webm'
  }
  // Ogg
  if (head[0] === 0x4f && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53) {
    return 'audio/ogg'
  }
  // ISO BMFF (MP4 / M4A): 4..8 が "ftyp"
  if (
    head.length >= 8 &&
    head[4] === 0x66 &&
    head[5] === 0x74 &&
    head[6] === 0x79 &&
    head[7] === 0x70
  ) {
    return 'audio/mp4'
  }
  return null
}
