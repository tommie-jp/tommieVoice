import { execFile } from 'node:child_process'
import { MAX_RECORDING_MS } from '../../../shared/constants.ts'

export type ExecResult = { stdout: string; stderr: string }
export type Exec = (file: string, args: readonly string[], timeoutMs: number) => Promise<ExecResult>

const MAX_OUTPUT_BYTES = 4 * 1024 * 1024
export const PROBE_TIMEOUT_MS = 15_000
export const TRANSCODE_TIMEOUT_MS = 60_000

export class MediaToolError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'MediaToolError'
  }
}

export const execTool: Exec = (file, args, timeoutMs) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { timeout: timeoutMs, maxBuffer: MAX_OUTPUT_BYTES, killSignal: 'SIGKILL' },
      (err, stdout, stderr) => {
        if (err) {
          const reason = err.killed ? 'timed out' : `exit ${String(err.code)}`
          const tail = String(stderr).trim().split('\n').slice(-3).join(' | ')
          reject(new MediaToolError(`${file} ${reason}: ${tail}`, { cause: err }))
          return
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) })
      },
    )
  })

export type ProbeResult = {
  readonly hasAudio: boolean
  readonly hasVideo: boolean
  readonly audioCodec: string | null
  readonly durationMs: number | null
}

type ProbeJson = {
  streams?: { codec_type?: string; codec_name?: string; duration?: string }[]
  format?: { duration?: string }
}

export function parseProbe(json: string): ProbeResult {
  let data: ProbeJson
  try {
    data = JSON.parse(json) as ProbeJson
  } catch (err) {
    throw new MediaToolError('ffprobe output is not JSON', { cause: err })
  }
  const streams = data.streams ?? []
  const audio = streams.find((s) => s.codec_type === 'audio')
  // 画像のカバーアート（mjpeg 等の 1 フレーム）も動画として扱い拒否する
  const hasVideo = streams.some((s) => s.codec_type === 'video')
  const seconds = Number(data.format?.duration ?? audio?.duration)
  return {
    hasAudio: audio !== undefined,
    hasVideo,
    audioCodec: audio?.codec_name ?? null,
    durationMs: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null,
  }
}

export async function probe(file: string, exec: Exec = execTool): Promise<ProbeResult> {
  const { stdout } = await exec(
    'ffprobe',
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
    PROBE_TIMEOUT_MS,
  )
  return parseProbe(stdout)
}

const SILENCE = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.3'

/**
 * 音声を AAC-LC 64 kbps mono の M4A に統一する（設計メモ 01）。
 * 前後の無音を詰め、ラウドネスを -16 LUFS に揃え、メタデータを捨て、上限秒数で切る。
 */
export function buildTranscodeArgs(input: string, output: string): string[] {
  const filters = [SILENCE, 'areverse', SILENCE, 'areverse', 'loudnorm=I=-16:TP=-1.5:LRA=11']
  return [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-i',
    input,
    '-vn',
    '-sn',
    '-dn',
    '-map_metadata',
    '-1',
    '-t',
    String(MAX_RECORDING_MS / 1000),
    '-af',
    filters.join(','),
    '-ac',
    '1',
    '-ar',
    '48000',
    '-c:a',
    'aac',
    '-b:a',
    '64k',
    '-movflags',
    '+faststart',
    '-f',
    'mp4',
    output,
  ]
}

export async function transcodeToM4a(
  input: string,
  output: string,
  exec: Exec = execTool,
): Promise<void> {
  await exec('ffmpeg', buildTranscodeArgs(input, output), TRANSCODE_TIMEOUT_MS)
}
