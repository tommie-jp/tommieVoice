import type { WorkerJob } from '../../../shared/schemas/transcript.ts'
import { runTranscriptionLoop, type JobApi } from './runner'
import type { Transcriber } from './types'

const job = (n: number): WorkerJob => ({
  id: `j${n}`,
  postId: `p${n}`,
  leaseToken: 't'.repeat(43),
  leaseUntil: '2026-09-18T12:15:00.000Z',
  durationMs: 1000,
  audioPath: `/api/worker/jobs/j${n}/audio`,
})

function setup(jobs: WorkerJob[], transcribe: Transcriber['transcribe']) {
  const queue = [...jobs]
  const api: JobApi & { submitted: unknown[]; failures: string[] } = {
    submitted: [],
    failures: [],
    claim: vi.fn(async () => queue.shift() ?? null),
    fetchAudio: vi.fn(async () => new Blob(['a'])),
    submit: vi.fn(async (_j, r) => {
      api.submitted.push(r)
    }),
    fail: vi.fn(async (_j, e) => {
      api.failures.push(e)
    }),
  }
  const transcriber: Transcriber = { load: vi.fn(), transcribe, dispose: vi.fn() }
  const decode = vi.fn(async () => ({ pcm: new Float32Array(16_000), durationSec: 1 }))
  return { api, transcriber, decode }
}

describe('runTranscriptionLoop', () => {
  it('processes jobs until claim returns nothing', async () => {
    const { api, transcriber, decode } = setup([job(1), job(2)], async () => ({
      text: 'こんにちは',
    }))
    const events: string[] = []
    let t = 0
    const result = await runTranscriptionLoop({
      api,
      transcriber,
      decode,
      workerId: 'browser',
      now: () => (t += 500),
      onEvent: (e) => events.push(e.type),
    })
    expect(result).toEqual({ done: 2, failed: 0, stoppedBy: 'empty' })
    expect(events).toEqual(['start', 'done', 'start', 'done'])
    expect(api.submitted[0]).toMatchObject({
      text: 'こんにちは',
      engine: 'transformers.js',
      language: 'ja',
      segments: [{ start: 0, end: 1, text: 'こんにちは' }],
    })
    expect(api.claim).toHaveBeenCalledWith('browser')
  })

  it('posts fail when transcriber throws and continues', async () => {
    const transcribe = vi
      .fn()
      .mockRejectedValueOnce(new Error('out of memory'))
      .mockResolvedValueOnce({ text: 'ok' })
    const { api, transcriber, decode } = setup([job(1), job(2)], transcribe)
    const result = await runTranscriptionLoop({ api, transcriber, decode, workerId: 'w' })
    expect(result).toEqual({ done: 1, failed: 1, stoppedBy: 'empty' })
    expect(api.failures).toEqual(['out of memory'])
  })

  it('stops after three consecutive failures even if reporting fails', async () => {
    const { api, transcriber, decode } = setup([job(1), job(2), job(3), job(4)], () =>
      Promise.reject('boom'),
    )
    api.fail = vi.fn().mockRejectedValue(new Error('network'))
    const result = await runTranscriptionLoop({ api, transcriber, decode, workerId: 'w' })
    expect(result).toEqual({ done: 0, failed: 3, stoppedBy: 'failures' })
    expect(api.claim).toHaveBeenCalledTimes(3)
  })

  it('abort stops after current job', async () => {
    const controller = new AbortController()
    const { api, transcriber, decode } = setup([job(1), job(2)], async () => {
      controller.abort()
      return { text: 'x' }
    })
    const result = await runTranscriptionLoop({
      api,
      transcriber,
      decode,
      workerId: 'w',
      signal: controller.signal,
    })
    expect(result).toEqual({ done: 1, failed: 0, stoppedBy: 'aborted' })
  })
})
