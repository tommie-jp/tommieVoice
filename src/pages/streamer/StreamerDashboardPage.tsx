import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import {
  REVIEW_STATUSES,
  type InboxItem,
  type ReviewStatus,
} from '../../../shared/schemas/streamer.ts'
import { errorMessage } from '../../api/client'
import {
  airPost,
  fetchInbox,
  fetchMe,
  fetchTranscriptionStatus,
  streamerLogout,
  updateInbox,
} from '../../api/streamer'
import { PageHeader, StatusBlock } from '../../components/Layout'
import { InboxRow, type InboxAction } from '../../components/streamer/InboxRow'
import { OverlayPanel } from '../../components/streamer/OverlayPanel'
import { TranscriptionPanel } from '../../components/streamer/TranscriptionPanel'
import { useAsync } from '../../hooks/useAsync'
import { getPlayer, usePlayerValue } from '../../hooks/usePlayer'
import { currentItem } from '../../lib/player'

const REFRESH_MS = 30_000

const TAB_LABELS: Readonly<Record<ReviewStatus, string>> = {
  pending: '未処理',
  approved: '採用',
  aired: '配信済み',
  rejected: '却下',
}

export function StreamerDashboardPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<ReviewStatus>('pending')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const me = useAsync(() => fetchMe().then((r) => r.data), [])
  const inbox = useAsync(() => fetchInbox(tab).then((r) => r.data), [tab])
  const status = useAsync(() => fetchTranscriptionStatus().then((r) => r.data), [])
  const playingId = usePlayerValue((s) => currentItem(s)?.id ?? null)
  const isPlaying = usePlayerValue((s) => s.playing)
  const { reload: reloadInbox } = inbox
  const { reload: reloadMe } = me
  const { reload: reloadStatus } = status

  const refresh = useCallback(() => {
    reloadInbox()
    reloadMe()
    reloadStatus()
  }, [reloadInbox, reloadMe, reloadStatus])

  // 配信中も新着を拾えるよう定期的に読み直す
  useEffect(() => {
    const id = window.setInterval(refresh, REFRESH_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  const items = useMemo(() => inbox.data ?? [], [inbox.data])

  const handlePlay = useCallback(
    (item: InboxItem) => {
      const player = getPlayer()
      if (playingId === item.post.id) {
        player.toggle()
        return
      }
      if (!item.post.audioUrl) return
      player.playQueue(
        [
          {
            id: item.post.id,
            url: item.post.audioUrl,
            label: `${item.threadTitle} ${item.post.authorName ?? '名無し'}`,
          },
        ],
        0,
      )
    },
    [playingId],
  )

  const handleAction = useCallback(
    async (item: InboxItem, action: InboxAction) => {
      setBusyId(item.post.id)
      setError(null)
      try {
        if (action.type === 'review') {
          await updateInbox(item.post.id, { reviewStatus: action.status })
        } else if (action.type === 'air') {
          await airPost(item.post.id)
        } else if (action.type === 'airedRef') {
          await updateInbox(item.post.id, {
            airedRef: action.url.trim() === '' ? null : action.url.trim(),
          })
        } else {
          const index = items.findIndex((i) => i.post.id === item.post.id)
          const other = items[index + action.delta]
          if (other) {
            await updateInbox(item.post.id, {
              queueOrder: other.queueOrder ?? index + action.delta,
            })
            await updateInbox(other.post.id, { queueOrder: item.queueOrder ?? index })
          }
        }
        refresh()
      } catch (err) {
        setError(errorMessage(err))
      } finally {
        setBusyId(null)
      }
    },
    [items, refresh],
  )

  const logout = async () => {
    await streamerLogout().catch(() => undefined)
    getPlayer().stop()
    navigate('/streamer/login', { replace: true })
  }

  if (me.error && me.status === 'error') {
    return <Navigate to="/streamer/login" replace />
  }
  const counts = me.data?.counts

  return (
    <>
      <PageHeader
        title={me.data ? `${me.data.displayName} の凸待ち箱` : '凸待ち箱'}
        back="/"
        action={
          <button type="button" className="text-button" onClick={() => void logout()}>
            ログアウト
          </button>
        }
      />
      <main className="page">
        <TranscriptionPanel status={status.data} onDone={refresh} />
        <OverlayPanel onChanged={refresh} />
        <div className="tabs" role="tablist">
          {REVIEW_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={tab === s}
              className={`tab ${tab === s ? 'is-active' : ''}`}
              onClick={() => setTab(s)}
            >
              {TAB_LABELS[s]}
              {counts ? ` ${counts[s]}` : ''}
            </button>
          ))}
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <StatusBlock
          loading={inbox.status === 'loading'}
          error={inbox.error}
          onRetry={reloadInbox}
        />
        {inbox.status === 'ready' && items.length === 0 ? (
          <p className="empty">{TAB_LABELS[tab]}の声はありません</p>
        ) : null}
        <ol className="post-list">
          {items.map((item) => (
            <InboxRow
              key={item.post.id}
              item={item}
              tab={tab}
              isPlaying={playingId === item.post.id && isPlaying}
              busy={busyId === item.post.id}
              onPlay={handlePlay}
              onAction={(i, a) => void handleAction(i, a)}
            />
          ))}
        </ol>
      </main>
    </>
  )
}
