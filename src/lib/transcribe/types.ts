import type { TranscriptSegment } from '../../../shared/schemas/transcript.ts'

export const MODEL_ID = 'onnx-community/whisper-large-v3-turbo'
export const ENGINE = 'transformers.js'
export const SAMPLE_RATE = 16_000

/** quality: encoder fp16 + decoder q4（約 1.6 GB） / light: 両方 q4f16（約 560 MB） */
export const PROFILES = {
  quality: { encoder_model: 'fp16', decoder_model_merged: 'q4' },
  light: { encoder_model: 'q4f16', decoder_model_merged: 'q4f16' },
} as const
export type ProfileName = keyof typeof PROFILES

export const PROFILE_LABELS: Readonly<Record<ProfileName, string>> = {
  quality: '高精度（初回 約 1.6 GB）',
  light: '軽量（初回 約 560 MB）',
}

export type RawChunk = { timestamp: [number, number | null]; text: string }
export type RawOutput = { text: string; chunks?: RawChunk[] }

export type CleanTranscript = { text: string; segments: TranscriptSegment[] }

export type LoadProgress = { loaded: number; total: number; progress: number }

export type Transcriber = {
  load(onProgress?: (p: LoadProgress) => void): Promise<void>
  transcribe(pcm16k: Float32Array): Promise<RawOutput>
  dispose(): void
}
