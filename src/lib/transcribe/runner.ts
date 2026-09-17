import type { WorkerJob } from '../../../shared/schemas/transcript.ts'
import { cleanTranscript } from './postprocess'
import { ENGINE, MODEL_ID, type CleanTranscript, type Transcriber } from './types'

export type JobApi = {
  claim(workerId: string): Promise<WorkerJob | null>
  fetchAudio(job: WorkerJob): Promise<Blob>
  submit(
    job: WorkerJob,
    result: CleanTranscript & { engine: string; model: string; language: string },
  ): Promise<void>
  fail(job: WorkerJob, error: string): Promise<void>
}

export type Decode = (blob: Blob) => Promise<{ pcm: Float32Array; durationSec: number }>

export type RunnerEvent =
  | { type: 'start'; job: WorkerJob }
  | { type: 'done'; job: WorkerJob; seconds: number; audioSeconds: number; text: string }
  | { type: 'failed'; job: WorkerJob; error: string }

export type RunnerResult = {
  done: number
  failed: number
  stoppedBy: 'empty' | 'aborted' | 'failures'
}

export const MAX_CONSECUTIVE_FAILURES = 3

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** キューが空になるまで claim → 音声取得 → 文字起こし → 結果送信 を繰り返す */
export async function runTranscriptionLoop(opts: {
  api: JobApi
  transcriber: Transcriber
  decode: Decode
  workerId: string
  signal?: AbortSignal
  now?: () => number
  onEvent?: (event: RunnerEvent) => void
}): Promise<RunnerResult> {
  const now = opts.now ?? (() => performance.now())
  let done = 0
  let failed = 0
  let streak = 0
  for (;;) {
    if (opts.signal?.aborted) return { done, failed, stoppedBy: 'aborted' }
    const job = await opts.api.claim(opts.workerId)
    if (!job) return { done, failed, stoppedBy: 'empty' }
    opts.onEvent?.({ type: 'start', job })
    const started = now()
    try {
      const { pcm, durationSec } = await opts.decode(await opts.api.fetchAudio(job))
      const raw = await opts.transcriber.transcribe(pcm)
      const clean = cleanTranscript(raw, durationSec)
      await opts.api.submit(job, { ...clean, engine: ENGINE, model: MODEL_ID, language: 'ja' })
      done += 1
      streak = 0
      opts.onEvent?.({
        type: 'done',
        job,
        seconds: (now() - started) / 1000,
        audioSeconds: durationSec,
        text: clean.text,
      })
    } catch (err) {
      failed += 1
      streak += 1
      const error = message(err)
      opts.onEvent?.({ type: 'failed', job, error })
      await opts.api.fail(job, error).catch(() => undefined)
      if (streak >= MAX_CONSECUTIVE_FAILURES) return { done, failed, stoppedBy: 'failures' }
    }
  }
}
