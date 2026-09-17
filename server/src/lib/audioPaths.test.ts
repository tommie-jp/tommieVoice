import { describe, expect, it } from 'vitest'
import { publicAudioUrl, relativeAudioPath, resolveAudioPath } from './audioPaths.ts'

const ID = '0b3c9a34-6f0e-4f3b-9d8a-1f2e3d4c5b6a'

describe('audioPaths', () => {
  it('builds year/month path from clock in UTC', () => {
    expect(relativeAudioPath(new Date('2026-09-30T23:30:00Z'), ID, 'webm')).toBe(
      `2026/09/${ID}.webm`,
    )
  })

  it('rejects ids that are not uuids', () => {
    expect(() => relativeAudioPath(new Date(), '../etc', 'webm')).toThrow()
  })

  it('rejects unknown extensions', () => {
    expect(() => relativeAudioPath(new Date(), ID, 'exe')).toThrow()
  })

  it('resolves inside the area directory', () => {
    expect(resolveAudioPath('/data/audio', 'public', `2026/09/${ID}.m4a`)).toBe(
      `/data/audio/public/2026/09/${ID}.m4a`,
    )
  })

  it('never resolves paths containing ..', () => {
    expect(() => resolveAudioPath('/data/audio', 'original', '../../etc/passwd')).toThrow()
    expect(() => resolveAudioPath('/data/audio', 'original', `2026/../${ID}.webm`)).toThrow()
  })

  it('builds the public url', () => {
    expect(publicAudioUrl(`2026/09/${ID}.m4a`)).toBe(`/audio/public/2026/09/${ID}.m4a`)
  })
})
