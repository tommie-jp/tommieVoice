/// <reference lib="webworker" />
// Web Worker: Transformers.js + ONNX Runtime Web（WebGPU）で Whisper を動かす。
// ブラウザでしか動かないので単体テストの対象外（lab ページと実機で確認する）。
import { env, pipeline } from '@huggingface/transformers'
import type { FromWorker, ToWorker } from './messages'
import { MODEL_ID, PROFILES, type ProfileName, type RawOutput } from './types'

type Asr = (audio: Float32Array, options: Record<string, unknown>) => Promise<RawOutput>

// ONNX Runtime の wasm は自前で配信する（CSP で外部スクリプトを許さないため）
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = '/ort/'
  env.backends.onnx.wasm.numThreads = 1
}
env.allowLocalModels = false

let asr: Promise<Asr> | null = null
let loadedProfile: ProfileName | null = null

const post = (message: FromWorker) => self.postMessage(message)

function load(id: number, profile: ProfileName): Promise<Asr> {
  if (asr && loadedProfile === profile) return asr
  loadedProfile = profile
  asr = pipeline('automatic-speech-recognition', MODEL_ID, {
    device: 'webgpu',
    dtype: PROFILES[profile],
    progress_callback: (info) => {
      if (info.status === 'progress_total') {
        post({
          type: 'progress',
          id,
          progress: { loaded: info.loaded, total: info.total, progress: info.progress },
        })
      }
    },
  }) as unknown as Promise<Asr>
  asr.catch(() => {
    asr = null
    loadedProfile = null
  })
  return asr
}

self.addEventListener('message', (event: MessageEvent<ToWorker>) => {
  const msg = event.data
  const run = async () => {
    if (msg.type === 'load') {
      await load(msg.id, msg.profile)
      post({ type: 'ready', id: msg.id })
      return
    }
    if (!asr) throw new Error('モデルが読み込まれていません')
    const transcriber = await asr
    const output = await transcriber(msg.audio, {
      language: 'japanese',
      task: 'transcribe',
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
    })
    post({ type: 'result', id: msg.id, output: { text: output.text, chunks: output.chunks } })
  }
  run().catch((err: unknown) => {
    post({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) })
  })
})
