import { describe, expect, it } from 'vitest'
import { MAX_RECORDING_MS, MAX_REPORTED_DURATION_MS, MAX_UPLOAD_BYTES } from './constants.ts'

describe('shared constants', () => {
  it('MAX_RECORDING_MS is 90 seconds', () => {
    expect(MAX_RECORDING_MS).toBe(90_000)
  })

  it('allows a small margin over the recording limit for client-measured duration', () => {
    expect(MAX_REPORTED_DURATION_MS - MAX_RECORDING_MS).toBe(2_000)
  })

  it('upload limit comfortably exceeds 90 s of 128 kbps audio', () => {
    const bytesFor90sAt128k = (128_000 / 8) * 90
    expect(MAX_UPLOAD_BYTES).toBeGreaterThan(bytesFor90sAt128k * 4)
  })
})
