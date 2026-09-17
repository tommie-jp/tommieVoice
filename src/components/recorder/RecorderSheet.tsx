import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import {
  AUTHOR_NAME_MAX_LENGTH,
  MAX_RECORDING_MS,
  TITLE_MAX_LENGTH,
} from '../../../shared/constants.ts'
import type { RecordedAudio } from '../../api/board'
import { errorMessage } from '../../api/client'
import { getPlayer } from '../../hooks/usePlayer'
import { formatDuration } from '../../lib/format'
import { readStorage, writeStorage } from '../../lib/storage'
import { RecordButton } from '../RecordButton'
import { useRecorder, type RecorderLike } from './useRecorder'

const AUTHOR_KEY = 'tv.authorName'

export type RecorderSubmit = {
  audio: RecordedAudio
  title: string | null
  authorName: string | null
}

type Props = {
  heading: string
  /** 新スレッドはタイトル必須 */
  requireTitle: boolean
  replyToSeq?: number | null
  scriptText?: string | null
  onSubmit(input: RecorderSubmit): Promise<void>
  onClose(): void
  createRecorder?: () => RecorderLike
  maxDurationMs?: number
}

export function RecorderSheet(props: Props) {
  const { heading, requireTitle, replyToSeq, scriptText, onSubmit, onClose } = props
  const rec = useRecorder(props.createRecorder, props.maxDurationMs ?? MAX_RECORDING_MS)
  const [title, setTitle] = useState('')
  const [authorName, setAuthorName] = useState(() => readStorage(AUTHOR_KEY) ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const titleId = useId()
  const nameId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  const busy = submitting || rec.status === 'starting' || rec.status === 'stopping'
  const trimmedTitle = title.trim()
  const canSubmit = rec.recorded !== null && !submitting && (!requireTitle || trimmedTitle !== '')
  const remainingMs = (props.maxDurationMs ?? MAX_RECORDING_MS) - rec.elapsedMs

  const handleToggle = () => {
    if (rec.status === 'recording') void rec.stop()
    else if (rec.status === 'idle') {
      // 再生中の音をマイクが拾わないように、また iOS の再生専用セッションを解くために止める
      getPlayer().stop()
      void rec.start()
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!rec.recorded || !canSubmit) return
    setSubmitting(true)
    setSubmitError(null)
    const name = authorName.trim()
    writeStorage(AUTHOR_KEY, name)
    try {
      await onSubmit({
        audio: rec.recorded,
        title: trimmedTitle === '' ? null : trimmedTitle,
        authorName: name === '' ? null : name,
      })
    } catch (err) {
      setSubmitError(errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={submitting ? undefined : onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-header">
          <h2 className="sheet-title">{heading}</h2>
          <button type="button" className="text-button" onClick={onClose} disabled={submitting}>
            閉じる
          </button>
        </div>

        {replyToSeq ? <p className="sheet-note">&gt;&gt;{replyToSeq} への返事</p> : null}
        {scriptText ? (
          <details className="script-box">
            <summary>台本を見る</summary>
            <p className="script-text">{scriptText}</p>
          </details>
        ) : null}

        <form className="sheet-form" onSubmit={handleSubmit}>
          <label htmlFor={titleId} className="field-label">
            タイトル{requireTitle ? '' : '（任意）'}
          </label>
          <input
            id={titleId}
            className="text-input"
            value={title}
            maxLength={TITLE_MAX_LENGTH}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={requireTitle ? '例: 決め台詞を言ってみた' : ''}
            enterKeyHint="done"
          />
          <label htmlFor={nameId} className="field-label">
            名前（任意）
          </label>
          <input
            id={nameId}
            className="text-input"
            value={authorName}
            maxLength={AUTHOR_NAME_MAX_LENGTH}
            onChange={(e) => setAuthorName(e.target.value)}
            placeholder="名無し"
            autoComplete="nickname"
            enterKeyHint="done"
          />

          <div className="recorder-area">
            {rec.recorded ? (
              <div className="preview">
                <audio
                  className="preview-audio"
                  controls
                  preload="auto"
                  src={rec.recorded.url}
                  aria-label="録音の試聴"
                />
                <div className="preview-meta">{formatDuration(rec.recorded.durationMs)}</div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={rec.reset}
                  disabled={submitting}
                >
                  録り直す
                </button>
              </div>
            ) : (
              <>
                <RecordButton
                  status={rec.status === 'recording' ? 'recording' : 'idle'}
                  elapsedMs={rec.elapsedMs}
                  disabled={busy}
                  onToggle={handleToggle}
                />
                <p className="recorder-hint">
                  {rec.status === 'recording'
                    ? `残り ${formatDuration(Math.max(0, remainingMs))}`
                    : `タップで録音（最大 ${formatDuration(props.maxDurationMs ?? MAX_RECORDING_MS)}）`}
                </p>
              </>
            )}
          </div>

          {rec.error || submitError ? (
            <p className="form-error" role="alert">
              {rec.error ?? submitError}
            </p>
          ) : null}

          <button type="submit" className="primary-button" disabled={!canSubmit}>
            {submitting ? '送信中…' : '投稿する'}
          </button>
          <p className="consent-note">
            投稿した声は誰でも聴けるようになり、配信などで紹介されることがあります。
          </p>
        </form>
      </div>
    </div>
  )
}
