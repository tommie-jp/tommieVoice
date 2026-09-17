import { memo, useState } from 'react'
import type { InboxItem, ReviewStatus } from '../../../shared/schemas/streamer.ts'
import { formatDuration, formatRelative } from '../../lib/format'
import { AiredBadge } from '../board/AiredBadge'

const TAG_LABELS: Readonly<Record<string, string>> = {
  question: '質問',
  request: '依頼',
  greeting: '挨拶',
  script: 'お題への回答',
}
const RISK_LABELS: Readonly<Record<string, string>> = {
  ng_word: 'NG ワード',
  contact_info: '連絡先',
  empty: '無音？',
}
const TRANSCRIPT_STATE: Readonly<Record<InboxItem['transcriptState'], string>> = {
  none: '文字起こしなし',
  queued: '文字起こし待ち',
  leased: '文字起こし中…',
  done: '',
  failed: '文字起こし失敗',
}

export type InboxAction =
  | { type: 'review'; status: 'pending' | 'approved' | 'rejected' }
  | { type: 'move'; delta: -1 | 1 }
  | { type: 'air' }
  | { type: 'airedRef'; url: string }

type Props = {
  item: InboxItem
  tab: ReviewStatus
  isPlaying: boolean
  busy: boolean
  onPlay(item: InboxItem): void
  onAction(item: InboxItem, action: InboxAction): void
}

export const InboxRow = memo(function InboxRow({
  item,
  tab,
  isPlaying,
  busy,
  onPlay,
  onAction,
}: Props) {
  const { post, transcript } = item
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState(post.airedRef ?? '')
  const risky = (transcript?.riskFlags.length ?? 0) > 0
  const label = `${item.threadTitle}${post.seq > 1 ? ` #${post.seq}` : ''}`
  const act = (action: InboxAction) => onAction(item, action)

  return (
    <li className={`inbox-row ${risky ? 'is-risky' : ''}`} aria-label={label}>
      <button
        type="button"
        className="play-button"
        disabled={!post.audioUrl}
        onClick={() => onPlay(item)}
        aria-label={isPlaying ? `${label} を一時停止` : `${label} を再生`}
      >
        <span aria-hidden>{isPlaying ? '❚❚' : '▶'}</span>
      </button>
      <div className="post-body">
        <div className="post-meta">
          <span className="post-seq">{label}</span>
          <span className="post-author">{post.authorName ?? '名無し'}</span>
          <span className="post-time">{formatRelative(post.createdAt)}</span>
          <span>{formatDuration(post.durationMs)}</span>
        </div>
        <div className="chips">
          {transcript?.riskFlags.map((f) => (
            <span key={f} className="chip risk">
              ⚠ {RISK_LABELS[f] ?? f}
            </span>
          ))}
          {transcript?.tags.map((t) => (
            <span key={t} className="chip">
              {TAG_LABELS[t] ?? t}
            </span>
          ))}
        </div>
        {transcript ? (
          <button
            type="button"
            className="summary"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? transcript.text : transcript.summary || '（聞き取れる言葉がありません）'}
          </button>
        ) : (
          <p className="card-meta">{TRANSCRIPT_STATE[item.transcriptState]}</p>
        )}
        {tab === 'aired' ? (
          <div className="aired-edit">
            <AiredBadge airedRef={post.airedRef} />
            <input
              className="text-input"
              type="url"
              inputMode="url"
              placeholder="配信 URL（任意）"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-label={`${label} の配信 URL`}
            />
            <button
              type="button"
              className="secondary-button"
              disabled={busy || url === (post.airedRef ?? '')}
              onClick={() => act({ type: 'airedRef', url })}
            >
              保存
            </button>
          </div>
        ) : null}
        <div className="inbox-actions">
          {tab === 'pending' ? (
            <>
              <button
                type="button"
                className="primary-button"
                disabled={busy}
                onClick={() => act({ type: 'review', status: 'approved' })}
              >
                採用
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => act({ type: 'review', status: 'rejected' })}
              >
                却下
              </button>
            </>
          ) : null}
          {tab === 'approved' ? (
            <>
              <button
                type="button"
                className="primary-button"
                disabled={busy}
                onClick={() => act({ type: 'air' })}
              >
                今流す
              </button>
              <button
                type="button"
                className="secondary-button"
                aria-label={`${label} を上へ`}
                disabled={busy}
                onClick={() => act({ type: 'move', delta: -1 })}
              >
                ↑
              </button>
              <button
                type="button"
                className="secondary-button"
                aria-label={`${label} を下へ`}
                disabled={busy}
                onClick={() => act({ type: 'move', delta: 1 })}
              >
                ↓
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => act({ type: 'review', status: 'pending' })}
              >
                保留
              </button>
            </>
          ) : null}
          {tab === 'rejected' ? (
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => act({ type: 'review', status: 'pending' })}
            >
              未処理に戻す
            </button>
          ) : null}
        </div>
      </div>
    </li>
  )
})
