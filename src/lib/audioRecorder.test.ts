import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  AudioCaptureError,
  AudioRecorder,
  extensionFor,
  mapCaptureError,
  pickMimeType,
} from './audioRecorder'

describe('pickMimeType', () => {
  const originalMR = globalThis.MediaRecorder

  afterEach(() => {
    globalThis.MediaRecorder = originalMR
  })

  it('returns undefined when MediaRecorder is unavailable', () => {
    // @ts-expect-error delete global for test
    delete globalThis.MediaRecorder
    expect(pickMimeType()).toBeUndefined()
  })

  it('prefers webm/opus when supported', () => {
    globalThis.MediaRecorder = {
      isTypeSupported: (t: string) => t === 'audio/webm;codecs=opus',
    } as unknown as typeof MediaRecorder
    expect(pickMimeType()).toBe('audio/webm;codecs=opus')
  })

  it('falls back to mp4/aac when webm unsupported', () => {
    globalThis.MediaRecorder = {
      isTypeSupported: (t: string) => t.startsWith('audio/mp4'),
    } as unknown as typeof MediaRecorder
    expect(pickMimeType()).toBe('audio/mp4;codecs=mp4a.40.2')
  })
})

describe('extensionFor', () => {
  it.each([
    ['audio/webm;codecs=opus', 'webm'],
    ['audio/webm', 'webm'],
    ['audio/mp4;codecs=mp4a.40.2', 'm4a'],
    ['audio/mp4', 'm4a'],
    ['audio/ogg', 'ogg'],
    ['application/octet-stream', 'bin'],
  ])('%s -> %s', (mime, ext) => {
    expect(extensionFor(mime)).toBe(ext)
  })
})

type MockRecorder = {
  state: 'inactive' | 'recording'
  mimeType: string
  ondataavailable: ((e: { data: Blob }) => void) | null
  onstop: (() => void) | null
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

describe('AudioRecorder', () => {
  const originalMR = globalThis.MediaRecorder
  const originalMD = (navigator as Navigator & { mediaDevices?: MediaDevices }).mediaDevices

  let instance: MockRecorder

  beforeEach(() => {
    instance = {
      state: 'inactive',
      mimeType: 'audio/webm;codecs=opus',
      ondataavailable: null,
      onstop: null,
      start: vi.fn(() => {
        instance.state = 'recording'
      }),
      stop: vi.fn(() => {
        instance.state = 'inactive'
        instance.ondataavailable?.({
          data: new Blob(['chunk'], { type: instance.mimeType }),
        })
        instance.onstop?.()
      }),
    }

    function MediaRecorderCtor(this: unknown) {
      return instance
    }
    MediaRecorderCtor.isTypeSupported = (t: string) => t === 'audio/webm;codecs=opus'
    globalThis.MediaRecorder = MediaRecorderCtor as unknown as typeof MediaRecorder

    const track = { stop: vi.fn() } as unknown as MediaStreamTrack
    const stream = { getTracks: () => [track] } as unknown as MediaStream
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
      configurable: true,
    })
  })

  afterEach(() => {
    globalThis.MediaRecorder = originalMR
    Object.defineProperty(navigator, 'mediaDevices', {
      value: originalMD,
      configurable: true,
    })
  })

  it('start → stop produces a Blob with the chosen mime type', async () => {
    const rec = new AudioRecorder()
    await rec.start()
    expect(rec.isRecording).toBe(true)
    const result = await rec.stop()
    expect(result.blob.type).toBe('audio/webm;codecs=opus')
    expect(result.mimeType).toBe('audio/webm;codecs=opus')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(rec.isRecording).toBe(false)
  })

  it('throws when stopping without start', async () => {
    const rec = new AudioRecorder()
    await expect(rec.stop()).rejects.toThrow('録音中ではありません')
  })

  it('throws when starting twice', async () => {
    const rec = new AudioRecorder()
    await rec.start()
    await expect(rec.start()).rejects.toThrow('既に録音中です')
  })

  it('wraps iOS AudioSession error into AudioCaptureError with guidance', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi
          .fn()
          .mockRejectedValue(
            new Error('AudioSession category is not compatible with audio capture.'),
          ),
      },
      configurable: true,
    })
    const rec = new AudioRecorder()
    await expect(rec.start()).rejects.toBeInstanceOf(AudioCaptureError)
    await expect(rec.start()).rejects.toThrow(/iOS Safari/)
  })
})

describe('mapCaptureError', () => {
  it('maps AudioSession wording to iOS guidance', () => {
    const mapped = mapCaptureError(
      new Error('AudioSession category is not compatible with audio capture.'),
    )
    expect(mapped).toBeInstanceOf(AudioCaptureError)
    expect(mapped.message).toMatch(/iOS Safari/)
  })

  it('maps NotAllowedError to permission guidance', () => {
    const e = new Error('Permission denied')
    e.name = 'NotAllowedError'
    expect(mapCaptureError(e).message).toMatch(/マイクの利用が許可/)
  })

  it('maps NotFoundError', () => {
    const e = new Error('no device')
    e.name = 'NotFoundError'
    expect(mapCaptureError(e).message).toMatch(/マイクが見つかりません/)
  })

  it('passes through AudioCaptureError as-is', () => {
    const orig = new AudioCaptureError('original')
    expect(mapCaptureError(orig)).toBe(orig)
  })
})

describe('AudioRecorder edge cases', () => {
  const originalMR = globalThis.MediaRecorder
  const originalMD = navigator.mediaDevices

  afterEach(() => {
    globalThis.MediaRecorder = originalMR
    Object.defineProperty(navigator, 'mediaDevices', { value: originalMD, configurable: true })
  })

  function install(state: 'inactive' | 'recording' = 'recording') {
    const stopTrack = vi.fn()
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn(async () => {
          await gate
          return { getTracks: () => [{ stop: stopTrack }] }
        }),
      },
      configurable: true,
    })
    const instance = {
      state,
      mimeType: 'audio/webm',
      ondataavailable: null as ((e: { data: Blob }) => void) | null,
      onstop: null as (() => void) | null,
      start: vi.fn(),
      stop: vi.fn(),
    }
    globalThis.MediaRecorder = Object.assign(
      vi.fn(function FakeMR() {
        return instance
      }),
      { isTypeSupported: (t: string) => t.startsWith('audio/webm') },
    ) as unknown as typeof MediaRecorder
    return { stopTrack, release, instance }
  }

  it('releases the microphone when cancelled while the permission prompt is open', async () => {
    const { stopTrack, release } = install()
    const rec = new AudioRecorder()
    const starting = rec.start()
    rec.cancel()
    release()
    await expect(starting).rejects.toThrow('録音を中止しました')
    expect(stopTrack).toHaveBeenCalled()
    expect(rec.isRecording).toBe(false)
  })

  it('resolves stop immediately when the recorder already stopped itself', async () => {
    const { release, instance } = install()
    release()
    const rec = new AudioRecorder()
    await rec.start()
    instance.state = 'inactive'
    instance.ondataavailable?.({ data: new Blob(['x']) })
    const result = await rec.stop()
    expect(result.blob.size).toBe(1)
    expect(instance.stop).not.toHaveBeenCalled()
  })

  it('offers ogg/opus as a last resort', () => {
    globalThis.MediaRecorder = {
      isTypeSupported: (t: string) => t.startsWith('audio/ogg'),
    } as unknown as typeof MediaRecorder
    expect(pickMimeType()).toBe('audio/ogg;codecs=opus')
  })
})
