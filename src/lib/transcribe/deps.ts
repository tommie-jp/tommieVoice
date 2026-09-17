import { streamerJobApi } from '../../api/worker'
import { decodeTo16kMono } from './audioDecode'
import type { Decode, JobApi } from './runner'
import type { ProfileName, Transcriber } from './types'
import { detectWebGpu, type WebGpuSupport } from './webgpuSupport'
import { createWorkerTranscriber } from './workerClient'

/** 画面から使う文字起こしの部品（テストでは差し替える） */
export type TranscribeDeps = {
  detect(): Promise<WebGpuSupport>
  createTranscriber(profile: ProfileName): Transcriber
  decode: Decode
  api: JobApi
}

export const defaultTranscribeDeps: TranscribeDeps = {
  detect: () => detectWebGpu(),
  createTranscriber: (profile) => createWorkerTranscriber(profile),
  decode: (blob) => decodeTo16kMono(blob),
  api: streamerJobApi,
}
