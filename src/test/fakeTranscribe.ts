import type { WorkerJob } from '../../shared/schemas/transcript.ts'
import type { TranscribeDeps } from '../lib/transcribe/deps'
import type { JobApi } from '../lib/transcribe/runner'
import type { LoadProgress, RawOutput, Transcriber } from '../lib/transcribe/types'

export function fakeJob(n: number): WorkerJob {
  return {
    id: `50000000-0000-4000-8000-00000000000${n}`,
    postId: `30000000-0000-4000-8000-00000000000${n}`,
    leaseToken: 'L'.repeat(43),
    leaseUntil: '2026-09-18T12:15:00.000Z',
    durationMs: 1000,
    audioPath: `/api/worker/jobs/${n}/audio`,
  }
}

export function fakeTranscribeDeps(
  opts: {
    supported?: boolean
    jobs?: WorkerJob[]
    transcribe?: (pcm: Float32Array) => Promise<RawOutput>
    loadError?: Error
  } = {},
) {
  const queue = [...(opts.jobs ?? [])]
  const created: string[] = []
  const disposed: number[] = []
  const api: JobApi & { submitted: unknown[] } = {
    submitted: [],
    claim: vi.fn(async () => queue.shift() ?? null),
    fetchAudio: vi.fn(async () => new Blob(['a'])),
    submit: vi.fn(async (_job, result) => {
      api.submitted.push(result)
    }),
    fail: vi.fn(async () => undefined),
  }
  const deps: TranscribeDeps = {
    detect: async () =>
      opts.supported === false
        ? { supported: false, reason: 'WebGPU がありません' }
        : { supported: true },
    createTranscriber: (profile) => {
      created.push(profile)
      const t: Transcriber = {
        async load(onProgress?: (p: LoadProgress) => void) {
          onProgress?.({ loaded: 50, total: 100, progress: 50 })
          if (opts.loadError) throw opts.loadError
        },
        transcribe: opts.transcribe ?? (async () => ({ text: '文字起こし結果' })),
        dispose: () => disposed.push(created.length),
      }
      return t
    },
    decode: vi.fn(async () => ({ pcm: new Float32Array(16_000), durationSec: 6 })),
    api,
  }
  return { deps, api, created, disposed }
}
