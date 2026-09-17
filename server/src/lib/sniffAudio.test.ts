import { describe, expect, it } from 'vitest'
import { sniffAudio } from './sniffAudio.ts'

const bytes = (...b: number[]) => Uint8Array.from(b)

describe('sniffAudio', () => {
  it('detects webm magic', () => {
    expect(sniffAudio(bytes(0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0))).toBe('audio/webm')
  })

  it('detects ftyp box', () => {
    const head = Buffer.from([0, 0, 0, 0x20, ...Buffer.from('ftypM4A ')])
    expect(sniffAudio(head)).toBe('audio/mp4')
  })

  it('detects ogg', () => {
    expect(sniffAudio(Buffer.from('OggS\0\0\0\0'))).toBe('audio/ogg')
  })

  it('returns null for png', () => {
    expect(sniffAudio(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBeNull()
  })

  it('returns null for too short input', () => {
    expect(sniffAudio(bytes(0x1a, 0x45))).toBeNull()
    expect(sniffAudio(bytes(0, 0, 0, 0, 0x66))).toBeNull()
  })
})
