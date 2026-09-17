import type { FromWorker, ToWorker } from './messages'
import type { LoadProgress, ProfileName, RawOutput, Transcriber } from './types'

export type WorkerLike = {
  postMessage(message: ToWorker, transfer?: Transferable[]): void
  addEventListener(type: 'message', listener: (event: MessageEvent<FromWorker>) => void): void
  addEventListener(type: 'error', listener: (event: ErrorEvent) => void): void
  terminate(): void
}

export function createModuleWorker(): WorkerLike {
  return new Worker(new URL('./transcribeWorker.ts', import.meta.url), {
    type: 'module',
  }) as WorkerLike
}

type Pending = {
  resolve(value: unknown): void
  reject(error: Error): void
  onProgress?: (p: LoadProgress) => void
}

/** Web Worker とのやり取りを Promise にする */
export function createWorkerTranscriber(
  profile: ProfileName,
  makeWorker: () => WorkerLike = createModuleWorker,
): Transcriber {
  const worker = makeWorker()
  const pending = new Map<number, Pending>()
  let nextId = 1

  worker.addEventListener('message', (event) => {
    const msg = event.data
    const entry = pending.get(msg.id)
    if (!entry) return
    if (msg.type === 'progress') {
      entry.onProgress?.(msg.progress)
      return
    }
    pending.delete(msg.id)
    if (msg.type === 'error') entry.reject(new Error(msg.message))
    else if (msg.type === 'result') entry.resolve(msg.output)
    else entry.resolve(undefined)
  })
  worker.addEventListener('error', (event) => {
    const error = new Error(event.message || '文字起こしの処理が停止しました')
    for (const entry of pending.values()) entry.reject(error)
    pending.clear()
  })

  const request = <T>(
    build: (id: number) => ToWorker,
    transfer: Transferable[] = [],
    onProgress?: Pending['onProgress'],
  ) =>
    new Promise<T>((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress })
      worker.postMessage(build(id), transfer)
    })

  return {
    load: (onProgress) => request<void>((id) => ({ type: 'load', id, profile }), [], onProgress),
    transcribe: (audio) =>
      request<RawOutput>((id) => ({ type: 'transcribe', id, audio }), [audio.buffer]),
    dispose() {
      worker.terminate()
      for (const entry of pending.values()) entry.reject(new Error('中止しました'))
      pending.clear()
    },
  }
}
