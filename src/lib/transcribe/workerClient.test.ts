import type { FromWorker, ToWorker } from './messages'
import { createWorkerTranscriber, type WorkerLike } from './workerClient'

function fakeWorker() {
  const listeners: Record<string, ((e: never) => void)[]> = { message: [], error: [] }
  const sent: ToWorker[] = []
  const worker: WorkerLike & {
    emit(msg: FromWorker): void
    fail(message: string): void
    terminated: boolean
  } = {
    terminated: false,
    postMessage(message: ToWorker) {
      sent.push(message)
    },
    addEventListener(type: string, listener: (e: never) => void) {
      listeners[type]!.push(listener)
    },
    terminate() {
      worker.terminated = true
    },
    emit(msg) {
      listeners.message!.forEach((l) => l({ data: msg } as never))
    },
    fail(message) {
      listeners.error!.forEach((l) => l({ message } as never))
    },
  }
  return { worker, sent }
}

describe('createWorkerTranscriber', () => {
  it('resolves load after progress and ready messages', async () => {
    const { worker, sent } = fakeWorker()
    const t = createWorkerTranscriber('light', () => worker)
    const onProgress = vi.fn()
    const loading = t.load(onProgress)
    expect(sent[0]).toEqual({ type: 'load', id: 1, profile: 'light' })
    worker.emit({ type: 'progress', id: 1, progress: { loaded: 1, total: 2, progress: 50 } })
    worker.emit({ type: 'ready', id: 1 })
    await expect(loading).resolves.toBeUndefined()
    expect(onProgress).toHaveBeenCalledWith({ loaded: 1, total: 2, progress: 50 })
  })

  it('resolves result message for matching request id and ignores others', async () => {
    const { worker, sent } = fakeWorker()
    const t = createWorkerTranscriber('quality', () => worker)
    const audio = new Float32Array(4)
    const running = t.transcribe(audio)
    expect(sent[0]).toMatchObject({ type: 'transcribe', id: 1 })
    worker.emit({ type: 'result', id: 99, output: { text: 'other' } })
    worker.emit({ type: 'result', id: 1, output: { text: 'こんにちは' } })
    await expect(running).resolves.toEqual({ text: 'こんにちは' })
  })

  it('rejects on error message', async () => {
    const { worker } = fakeWorker()
    const t = createWorkerTranscriber('quality', () => worker)
    const running = t.transcribe(new Float32Array(1))
    worker.emit({ type: 'error', id: 1, message: 'WebGPU device lost' })
    await expect(running).rejects.toThrow('WebGPU device lost')
  })

  it('rejects everything when the worker crashes or is disposed', async () => {
    const { worker } = fakeWorker()
    const t = createWorkerTranscriber('quality', () => worker)
    const a = t.transcribe(new Float32Array(1))
    worker.fail('')
    await expect(a).rejects.toThrow('文字起こしの処理が停止しました')
    const b = t.load()
    t.dispose()
    await expect(b).rejects.toThrow('中止しました')
    expect(worker.terminated).toBe(true)
  })
})
