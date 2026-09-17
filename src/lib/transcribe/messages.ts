import type { LoadProgress, ProfileName, RawOutput } from './types'

export type ToWorker =
  | { type: 'load'; id: number; profile: ProfileName }
  | { type: 'transcribe'; id: number; audio: Float32Array }

export type FromWorker =
  | { type: 'progress'; id: number; progress: LoadProgress }
  | { type: 'ready'; id: number }
  | { type: 'result'; id: number; output: RawOutput }
  | { type: 'error'; id: number; message: string }
