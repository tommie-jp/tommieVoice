import { useEffect, useRef, useState } from 'react'
import type { TranscriptionStatus } from '../../../shared/schemas/transcript.ts'
import { errorMessage } from '../../api/client'
import { getDeviceId } from '../../lib/deviceId'
import { formatRelative } from '../../lib/format'
import { defaultTranscribeDeps, type TranscribeDeps } from '../../lib/transcribe/deps'
import { loadProfile, saveProfile } from '../../lib/transcribe/profile'
import { runTranscriptionLoop } from '../../lib/transcribe/runner'
import {
  PROFILE_LABELS,
  PROFILES,
  type ProfileName,
  type Transcriber,
} from '../../lib/transcribe/types'
import type { WebGpuSupport } from '../../lib/transcribe/webgpuSupport'

type Props = {
  status: TranscriptionStatus | null
  onDone(): void
  deps?: TranscribeDeps
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'loading'; progress: number }
  | { kind: 'running'; done: number; failed: number; current: string | null }
  | { kind: 'finished'; message: string }
  | { kind: 'error'; message: string }

const STOP_MESSAGES = {
  empty: '待ちの声をすべて文字起こししました',
  aborted: '中止しました',
  failures: '3 件続けて失敗したので止めました。軽量モードを試すか、PC を再起動してください',
} as const

/** 配信者のブラウザ（WebGPU）で文字起こしを実行する（設計メモ 05） */
export function TranscriptionPanel({ status, onDone, deps = defaultTranscribeDeps }: Props) {
  const [support, setSupport] = useState<WebGpuSupport | null>(null)
  const [profile, setProfile] = useState<ProfileName>(loadProfile)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const transcriber = useRef<{ profile: ProfileName; instance: Transcriber } | null>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    let alive = true
    void deps.detect().then((s) => {
      if (alive) setSupport(s)
    })
    return () => {
      alive = false
      abort.current?.abort()
      transcriber.current?.instance.dispose()
    }
  }, [deps])

  const busy = phase.kind === 'loading' || phase.kind === 'running'

  const run = async () => {
    const controller = new AbortController()
    abort.current = controller
    try {
      if (transcriber.current?.profile !== profile) {
        transcriber.current?.instance.dispose()
        transcriber.current = { profile, instance: deps.createTranscriber(profile) }
      }
      const instance = transcriber.current.instance
      setPhase({ kind: 'loading', progress: 0 })
      await instance.load((p) => setPhase({ kind: 'loading', progress: Math.round(p.progress) }))
      let done = 0
      let failed = 0
      setPhase({ kind: 'running', done, failed, current: null })
      const result = await runTranscriptionLoop({
        api: deps.api,
        transcriber: instance,
        decode: deps.decode,
        workerId: `browser-${getDeviceId().slice(0, 8)}`,
        signal: controller.signal,
        onEvent: (e) => {
          if (e.type === 'done') done += 1
          if (e.type === 'failed') failed += 1
          setPhase({
            kind: 'running',
            done,
            failed,
            current: e.type === 'start' ? e.job.postId : null,
          })
        },
      })
      setPhase({
        kind: 'finished',
        message: `${STOP_MESSAGES[result.stoppedBy]}（成功 ${result.done} 件・失敗 ${result.failed} 件）`,
      })
      onDone()
    } catch (err) {
      transcriber.current?.instance.dispose()
      transcriber.current = null
      setPhase({ kind: 'error', message: errorMessage(err) })
    }
  }

  const changeProfile = (next: ProfileName) => {
    saveProfile(next)
    setProfile(next)
  }

  return (
    <section className="panel transcription-panel" aria-label="文字起こし">
      {status ? (
        <>
          <div>
            文字起こし待ち <strong>{status.waiting}</strong> 件
            {status.leased > 0 ? ` ・ 処理中 ${status.leased} 件` : ''}
            {status.failed > 0 ? ` ・ 失敗 ${status.failed} 件` : ''}
          </div>
          <div className="card-meta">
            ワーカー最終接続:{' '}
            {status.lastWorkerSeenAt ? formatRelative(status.lastWorkerSeenAt) : 'まだありません'}
          </div>
        </>
      ) : null}

      {support && !support.supported ? <p className="card-meta">{support.reason}</p> : null}
      {support?.supported ? (
        <div className="transcribe-controls">
          <select
            className="text-input"
            value={profile}
            disabled={busy}
            onChange={(e) => changeProfile(e.target.value as ProfileName)}
            aria-label="文字起こしのモード"
          >
            {(Object.keys(PROFILES) as ProfileName[]).map((p) => (
              <option key={p} value={p}>
                {PROFILE_LABELS[p]}
              </option>
            ))}
          </select>
          {busy ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => abort.current?.abort()}
            >
              中止
            </button>
          ) : (
            <button type="button" className="primary-button" onClick={() => void run()}>
              文字起こしを実行
            </button>
          )}
        </div>
      ) : null}

      {phase.kind === 'loading' ? (
        <div role="status">
          モデルを準備中… {phase.progress}%
          <progress max={100} value={phase.progress} aria-label="モデルの読み込み" />
          <p className="card-meta">
            初回はダウンロードに数分かかります（Wi-Fi 推奨）。2 回目からはすぐ始まります。
          </p>
        </div>
      ) : null}
      {phase.kind === 'running' ? (
        <p role="status">
          文字起こし中… 完了 {phase.done} 件{phase.failed > 0 ? ` ・ 失敗 ${phase.failed} 件` : ''}
          <br />
          <span className="card-meta">このタブを開いたままにしてください</span>
        </p>
      ) : null}
      {phase.kind === 'finished' ? <p role="status">{phase.message}</p> : null}
      {phase.kind === 'error' ? (
        <p className="form-error" role="alert">
          {phase.message}
        </p>
      ) : null}
    </section>
  )
}
