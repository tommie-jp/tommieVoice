import { SAMPLE_RATE } from './types'

/** チャンネルを平均してモノラルにする */
export function mixToMono(channels: readonly Float32Array[]): Float32Array {
  const first = channels[0]
  if (!first) return new Float32Array(0)
  if (channels.length === 1) return first
  const out = new Float32Array(first.length)
  for (const ch of channels) {
    for (let i = 0; i < out.length; i += 1) out[i]! += (ch[i] ?? 0) / channels.length
  }
  return out
}

type OfflineCtor = new (channels: number, length: number, sampleRate: number) => OfflineAudioContext

/** 音声ファイルを 16 kHz モノラルの PCM にする（Whisper の入力形式） */
export async function decodeTo16kMono(
  blob: Blob,
  Offline: OfflineCtor = globalThis.OfflineAudioContext,
): Promise<{ pcm: Float32Array; durationSec: number }> {
  const bytes = await blob.arrayBuffer()
  // decodeAudioData のためだけの一時コンテキスト（サンプルレートは元のまま）
  const probe = new Offline(1, 1, 48_000)
  const decoded = await probe.decodeAudioData(bytes)
  const mono = mixToMono(
    Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i)),
  )
  const length = Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE))
  const ctx = new Offline(1, length, SAMPLE_RATE)
  const buffer = ctx.createBuffer(1, mono.length, decoded.sampleRate)
  buffer.copyToChannel(mono as Float32Array<ArrayBuffer>, 0)
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)
  source.start()
  const rendered = await ctx.startRendering()
  return { pcm: rendered.getChannelData(0), durationSec: decoded.duration }
}
