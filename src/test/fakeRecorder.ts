import type { RecorderLike } from '../components/recorder/useRecorder'

export function fakeRecorder(
  opts: { failStart?: Error; failStop?: Error; durationMs?: number } = {},
) {
  const recorder: RecorderLike & { started: number; cancelled: number } = {
    started: 0,
    cancelled: 0,
    async start() {
      if (opts.failStart) throw opts.failStart
      recorder.started += 1
    },
    async stop() {
      if (opts.failStop) throw opts.failStop
      return {
        blob: new Blob(['voice'], { type: 'audio/webm' }),
        mimeType: 'audio/webm;codecs=opus',
        durationMs: opts.durationMs ?? 1234,
      }
    },
    cancel() {
      recorder.cancelled += 1
    },
  }
  return recorder
}
