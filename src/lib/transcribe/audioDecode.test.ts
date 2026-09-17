import { decodeTo16kMono, mixToMono } from './audioDecode'

describe('mixToMono', () => {
  it('mixes stereo to mono before resampling', () => {
    const out = mixToMono([Float32Array.from([1, 0, 0.5]), Float32Array.from([0, 1, 0.5])])
    expect(Array.from(out)).toEqual([0.5, 0.5, 0.5])
  })

  it('returns mono input as-is and handles no channels', () => {
    const mono = Float32Array.from([0.1])
    expect(mixToMono([mono])).toBe(mono)
    expect(mixToMono([]).length).toBe(0)
  })
})

describe('decodeTo16kMono', () => {
  it('decodes, mixes and renders at 16 kHz with a fake OfflineAudioContext', async () => {
    const created: { channels: number; length: number; rate: number }[] = []
    const copied: Float32Array[] = []
    class FakeOffline {
      constructor(channels: number, length: number, rate: number) {
        created.push({ channels, length, rate })
      }
      async decodeAudioData() {
        return {
          numberOfChannels: 2,
          duration: 1.5,
          sampleRate: 48_000,
          getChannelData: (i: number) => Float32Array.from([i, i]),
        }
      }
      createBuffer() {
        return { copyToChannel: (data: Float32Array) => copied.push(data) }
      }
      createBufferSource() {
        return { buffer: null, connect() {}, start() {} }
      }
      destination = {}
      async startRendering() {
        return { getChannelData: () => new Float32Array(24_000) }
      }
    }
    const result = await decodeTo16kMono(new Blob(['x']), FakeOffline as never)
    expect(result.durationSec).toBe(1.5)
    expect(result.pcm.length).toBe(24_000)
    expect(created[1]).toEqual({ channels: 1, length: 24_000, rate: 16_000 })
    expect(Array.from(copied[0]!)).toEqual([0.5, 0.5])
  })
})
