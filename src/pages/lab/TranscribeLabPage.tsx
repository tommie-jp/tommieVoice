import { useEffect, useRef, useState } from 'react'
import { errorMessage } from '../../api/client'
import { PageHeader } from '../../components/Layout'
import { formatDuration } from '../../lib/format'
import { defaultTranscribeDeps, type TranscribeDeps } from '../../lib/transcribe/deps'
import { cleanTranscript } from '../../lib/transcribe/postprocess'
import {
  PROFILE_LABELS,
  PROFILES,
  type ProfileName,
  type Transcriber,
} from '../../lib/transcribe/types'
import type { WebGpuSupport } from '../../lib/transcribe/webgpuSupport'

type Row = {
  name: string
  status: 'pending' | 'running' | 'done' | 'error'
  audioSec?: number
  seconds?: number
  text?: string
  error?: string
}

/** 合格線（設計メモ 05 §6）: 45 分の音声を 15 分以内 = 実時間の 3 倍以上 */
export const TARGET_SPEED = 3

function summarize(rows: readonly Row[]) {
  const done = rows.filter((r) => r.status === 'done')
  const audio = done.reduce((s, r) => s + (r.audioSec ?? 0), 0)
  const spent = done.reduce((s, r) => s + (r.seconds ?? 0), 0)
  return { count: done.length, audio, spent, speed: spent > 0 ? audio / spent : 0 }
}

/** ブラウザ内文字起こしの計測ページ（/lab/transcribe） */
export function TranscribeLabPage({
  deps = defaultTranscribeDeps,
  now = () => performance.now(),
}: {
  deps?: TranscribeDeps
  now?: () => number
}) {
  const [support, setSupport] = useState<WebGpuSupport | null>(null)
  const [profile, setProfile] = useState<ProfileName>('quality')
  const [files, setFiles] = useState<File[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [loadInfo, setLoadInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const transcriber = useRef<Transcriber | null>(null)

  useEffect(() => {
    void deps.detect().then(setSupport)
    return () => transcriber.current?.dispose()
  }, [deps])

  const pick = (list: FileList | null) => {
    const picked = Array.from(list ?? [])
    setFiles(picked)
    setRows(picked.map((f) => ({ name: f.name, status: 'pending' })))
  }

  const update = (index: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))

  const run = async () => {
    setBusy(true)
    try {
      transcriber.current?.dispose()
      const t = deps.createTranscriber(profile)
      transcriber.current = t
      const started = now()
      await t.load((p) => setLoadInfo(`モデル読み込み ${Math.round(p.progress)}%`))
      setLoadInfo(`モデル読み込み ${((now() - started) / 1000).toFixed(1)} 秒`)
      for (const [i, file] of files.entries()) {
        update(i, { status: 'running' })
        try {
          const begin = now()
          const { pcm, durationSec } = await deps.decode(file)
          const clean = cleanTranscript(await t.transcribe(pcm), durationSec)
          update(i, {
            status: 'done',
            audioSec: durationSec,
            seconds: (now() - begin) / 1000,
            text: clean.text,
          })
        } catch (err) {
          update(i, { status: 'error', error: errorMessage(err) })
        }
      }
    } catch (err) {
      setLoadInfo(`失敗: ${errorMessage(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const exportJson = () => {
    const blob = new Blob(
      [JSON.stringify({ profile, userAgent: navigator.userAgent, loadInfo, rows }, null, 2)],
      {
        type: 'application/json',
      },
    )
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `transcribe-lab-${profile}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const total = summarize(rows)

  return (
    <>
      <PageHeader title="文字起こし計測" back="/" />
      <main className="page">
        <p className="lead small">
          手元の音声ファイルでブラウザ内文字起こしの速さと精度を測ります。合格線は実時間の{' '}
          {TARGET_SPEED} 倍以上（45 分の音声を 15 分以内）。
        </p>
        {support && !support.supported ? (
          <p className="form-error" role="alert">
            {support.reason}
          </p>
        ) : null}
        <div className="sheet-form panel">
          <label className="field-label" htmlFor="lab-profile">
            モード
          </label>
          <select
            id="lab-profile"
            className="text-input"
            value={profile}
            onChange={(e) => setProfile(e.target.value as ProfileName)}
            disabled={busy}
          >
            {(Object.keys(PROFILES) as ProfileName[]).map((p) => (
              <option key={p} value={p}>
                {PROFILE_LABELS[p]}
              </option>
            ))}
          </select>
          <label className="field-label" htmlFor="lab-files">
            音声ファイル（複数可）
          </label>
          <input
            id="lab-files"
            type="file"
            accept="audio/*"
            multiple
            onChange={(e) => pick(e.target.files)}
            disabled={busy}
          />
          <button
            type="button"
            className="primary-button"
            onClick={() => void run()}
            disabled={busy || files.length === 0 || !support?.supported}
          >
            {busy ? '計測中…' : '計測する'}
          </button>
          {loadInfo ? <p role="status">{loadInfo}</p> : null}
        </div>

        {rows.length > 0 ? (
          <table className="lab-table">
            <thead>
              <tr>
                <th>ファイル</th>
                <th>長さ</th>
                <th>処理</th>
                <th>倍速</th>
                <th>結果</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td>{r.audioSec !== undefined ? formatDuration(r.audioSec * 1000) : '-'}</td>
                  <td>
                    {r.seconds !== undefined
                      ? `${r.seconds.toFixed(1)} 秒`
                      : r.status === 'running'
                        ? '…'
                        : '-'}
                  </td>
                  <td>
                    {r.seconds && r.audioSec ? `${(r.audioSec / r.seconds).toFixed(1)}x` : '-'}
                  </td>
                  <td>{r.status === 'error' ? `失敗: ${r.error}` : (r.text ?? r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {total.count > 0 ? (
          <div className="panel" aria-label="集計">
            <p>
              {total.count} 件・音声 {formatDuration(total.audio * 1000)}・処理{' '}
              {total.spent.toFixed(1)} 秒・
              <strong>{total.speed.toFixed(1)}x</strong>{' '}
              {total.speed >= TARGET_SPEED
                ? '✅ 合格線を満たしています'
                : '⚠ 合格線に届いていません（軽量モードを試す）'}
            </p>
            <button type="button" className="secondary-button" onClick={exportJson}>
              JSON で保存
            </button>
          </div>
        ) : null}
      </main>
    </>
  )
}
