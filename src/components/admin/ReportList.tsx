import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { REPORT_REASONS } from '../../../shared/constants.ts'
import { REPORT_REASON_LABELS, type ReportSummary } from '../../../shared/schemas/report.ts'
import {
  adminFetchAudio,
  adminFetchReports,
  adminResolveReports,
  adminUpdatePost,
} from '../../api/board'
import { errorMessage } from '../../api/client'
import { useAsync } from '../../hooks/useAsync'
import { formatDuration, formatRelative } from '../../lib/format'
import { StatusBlock } from '../Layout'

type Action = 'hidden' | 'deleted' | 'ready' | 'resolve'

function ReportRow({
  item,
  token,
  onDone,
}: {
  item: ReportSummary
  token: string
  onDone(): void
}) {
  const { post } = item
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  const listen = async () => {
    setError(null)
    try {
      setAudioUrl(URL.createObjectURL(await adminFetchAudio(token, post.id)))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const act = async (action: Action) => {
    if (action === 'deleted' && !window.confirm(`#${post.seq} を完全に削除しますか？`)) return
    setBusy(true)
    setError(null)
    try {
      if (action === 'resolve') await adminResolveReports(token, post.id)
      else await adminUpdatePost(token, post.id, action)
      onDone()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const reasons = REPORT_REASONS.filter((r) => item.reasons[r] > 0)
    .map((r) => `${REPORT_REASON_LABELS[r]} ×${item.reasons[r]}`)
    .join(' / ')

  return (
    <li className="admin-row report-row" aria-label={`${post.threadTitle} #${post.seq} の通報`}>
      <div>
        <div>
          <strong>
            {post.threadTitle} #{post.seq}
          </strong>{' '}
          <span className="card-meta">{post.status}</span>
        </div>
        <div className="card-meta">
          {post.authorName ?? '名無し'} ・ {formatDuration(post.durationMs)} ・ 通報 {item.count}{' '}
          件（
          {formatRelative(item.firstReportedAt)}〜）
        </div>
        <div className="card-meta">{reasons}</div>
        {post.title ? <p className="post-title">{post.title}</p> : null}
        <Link to={`/threads/${post.threadId}#p${post.seq}`}>スレッドを開く</Link>
        {audioUrl ? (
          <audio
            className="preview-audio"
            src={audioUrl}
            controls
            autoPlay
            aria-label="通報された音声"
          />
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="admin-actions">
        <button type="button" className="secondary-button" onClick={listen} disabled={busy}>
          試聴
        </button>
        {post.status === 'hidden' ? (
          <button
            type="button"
            className="secondary-button"
            onClick={() => act('ready')}
            disabled={busy}
          >
            戻す
          </button>
        ) : (
          <button
            type="button"
            className="secondary-button"
            onClick={() => act('hidden')}
            disabled={busy}
          >
            非表示
          </button>
        )}
        <button
          type="button"
          className="secondary-button"
          onClick={() => act('deleted')}
          disabled={busy}
        >
          削除
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => act('resolve')}
          disabled={busy}
        >
          問題なし
        </button>
      </div>
    </li>
  )
}

export function ReportList({ token }: { token: string }) {
  const reports = useAsync(() => adminFetchReports(token).then((r) => r.data), [token])
  return (
    <section aria-label="通報">
      <StatusBlock
        loading={reports.status === 'loading'}
        error={reports.error}
        onRetry={reports.reload}
      />
      {reports.data?.length === 0 ? <p className="empty">未対応の通報はありません</p> : null}
      <ul className="admin-list">
        {reports.data?.map((item) => (
          <ReportRow key={item.post.id} item={item} token={token} onDone={reports.reload} />
        ))}
      </ul>
    </section>
  )
}
