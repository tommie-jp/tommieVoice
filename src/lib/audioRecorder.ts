const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/ogg;codecs=opus',
]

export function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t))
}

export function extensionFor(mimeType: string): string {
  if (mimeType.startsWith('audio/webm')) return 'webm'
  if (mimeType.startsWith('audio/mp4')) return 'm4a'
  if (mimeType.startsWith('audio/ogg')) return 'ogg'
  return 'bin'
}

export type RecordingResult = {
  blob: Blob
  mimeType: string
  durationMs: number
}

export class AudioCaptureError extends Error {
  override readonly cause?: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'AudioCaptureError'
    this.cause = cause
  }
}

// iOS Safari は <audio> 要素や過去の再生で AudioSession カテゴリが
// `playback` に固定されると getUserMedia を拒否する。ユーザージェスチャー内で
// AudioContext を resume することでセッションを capture 可能カテゴリに昇格させる。
async function primeAudioSession(): Promise<void> {
  const Ctor =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
  if (!Ctor) return
  try {
    const ctx = new Ctor()
    if (ctx.state === 'suspended') await ctx.resume()
    void ctx.close()
  } catch {
    // プライミング失敗しても本命の getUserMedia は試すのでここでは握り潰す
  }
}

export function mapCaptureError(e: unknown): AudioCaptureError {
  if (e instanceof AudioCaptureError) return e
  const err = e instanceof Error ? e : new Error(String(e))
  const msg = err.message
  if (/AudioSession|not compatible with audio capture/i.test(msg)) {
    return new AudioCaptureError(
      'iOS Safari でマイクを使えない状態です。他アプリの音声再生を止め、Safari のタブを閉じて開き直してください',
      e,
    )
  }
  if (err.name === 'NotAllowedError' || /Permission/i.test(msg)) {
    return new AudioCaptureError(
      'マイクの利用が許可されていません。ブラウザの設定からマイク許可を確認してください',
      e,
    )
  }
  if (err.name === 'NotFoundError') {
    return new AudioCaptureError('マイクが見つかりません', e)
  }
  return new AudioCaptureError(msg || '録音を開始できませんでした', e)
}

export class AudioRecorder {
  private recorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private chunks: Blob[] = []
  private startedAt = 0
  /** start() の途中で cancel() されたら立てる */
  private cancelled = false

  get isRecording(): boolean {
    return this.recorder?.state === 'recording'
  }

  async start(): Promise<void> {
    if (this.recorder) throw new AudioCaptureError('既に録音中です')
    const mimeType = pickMimeType()
    if (!mimeType) throw new AudioCaptureError('この端末は音声録音に対応していません')
    this.cancelled = false

    await primeAudioSession()

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (e) {
      throw mapCaptureError(e)
    }
    // 許可ダイアログの間に画面が閉じられたら、マイクを掴んだままにしない
    if (this.cancelled) {
      stream.getTracks().forEach((t) => t.stop())
      throw new AudioCaptureError('録音を中止しました')
    }
    const recorder = new MediaRecorder(stream, { mimeType })
    this.chunks = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    recorder.start()
    this.recorder = recorder
    this.stream = stream
    this.startedAt = Date.now()
  }

  async stop(): Promise<RecordingResult> {
    const recorder = this.recorder
    const stream = this.stream
    if (!recorder || !stream) throw new Error('録音中ではありません')

    const collect = (): RecordingResult => {
      const mimeType = recorder.mimeType
      const blob = new Blob(this.chunks, { type: mimeType })
      return { blob, mimeType, durationMs: Date.now() - this.startedAt }
    }
    // 着信などで録音が既に止まっていると stop イベントは二度と来ない
    const result =
      recorder.state === 'inactive'
        ? collect()
        : await new Promise<RecordingResult>((resolve) => {
            recorder.onstop = () => resolve(collect())
            recorder.stop()
          })

    stream.getTracks().forEach((t) => t.stop())
    this.recorder = null
    this.stream = null
    this.chunks = []
    return result
  }

  cancel(): void {
    this.cancelled = true
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = null
      this.recorder.stop()
    }
    this.stream?.getTracks().forEach((t) => t.stop())
    this.recorder = null
    this.stream = null
    this.chunks = []
  }
}
