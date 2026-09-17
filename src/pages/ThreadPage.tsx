import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useParams } from 'react-router'
import type { PostPublic } from '../../shared/schemas/post.ts'
import { createReply, deletePost, fetchThread, reportPost } from '../api/board'
import { ReportSheet } from '../components/board/ReportSheet'
import { errorMessage } from '../api/client'
import { PostRow } from '../components/board/PostRow'
import { PageHeader, StatusBlock } from '../components/Layout'
import { RecorderSheet, type RecorderSubmit } from '../components/recorder/RecorderSheet'
import { useAsync } from '../hooks/useAsync'
import { getPlayer, usePlayerValue } from '../hooks/usePlayer'
import { currentItem, type PlayerItem } from '../lib/player'
import { forgetDeleteToken, getDeleteToken, saveDeleteToken } from '../lib/postTokens'
import { shareLink, sharePostUrl, shareThreadUrl } from '../lib/share'

const REFRESH_AFTER_POST_MS = 3_000
/** 変換中の投稿があるときの再取得間隔と上限（約 1 分） */
const PROCESSING_POLL_MS = 3_000
const PROCESSING_POLL_MAX = 20

function toItem(post: PostPublic): PlayerItem | null {
  if (post.status !== 'ready' || !post.audioUrl) return null
  const who = post.authorName ?? '名無し'
  return { id: post.id, url: post.audioUrl, label: `#${post.seq} ${who}` }
}

function scrollToSeq(seq: number) {
  document.getElementById(`p${seq}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

/** ページ遷移で前のスレッドの状態が残らないよう、id ごとに作り直す */
export function ThreadPage() {
  const { id = '' } = useParams()
  return <ThreadView key={id} id={id} />
}

function ThreadView({ id }: { id: string }) {
  const { hash } = useLocation()
  const detail = useAsync(() => fetchThread(id).then((r) => r.data), [id])
  const playingId = usePlayerValue((s) => currentItem(s)?.id ?? null)
  const isPlaying = usePlayerValue((s) => s.playing)
  const [replyTo, setReplyTo] = useState<PostPublic | null | undefined>(undefined)
  const [justPosted, setJustPosted] = useState<{ url: string; label: string } | null>(null)
  const refreshTimer = useRef<number | undefined>(undefined)
  const [toast, setToast] = useState<string | null>(null)
  const [reporting, setReporting] = useState<PostPublic | null>(null)

  const posts = useMemo(() => detail.data?.posts ?? [], [detail.data])
  const { reload } = detail

  // 共有リンク（#p3）で開いたら、読み込み後に該当の投稿へ移動する
  useEffect(() => {
    const seq = /^#p(\d+)$/.exec(hash)?.[1]
    if (detail.status === 'ready' && seq) scrollToSeq(Number(seq))
  }, [detail.status, hash])

  // サーバの変換が終わるまで待って取り直す（投稿直後は「変換中」で届くため）
  const processingCount = posts.filter((p) => p.status === 'processing').length
  const pollsLeft = useRef(PROCESSING_POLL_MAX)
  useEffect(() => {
    if (processingCount === 0) {
      pollsLeft.current = PROCESSING_POLL_MAX
      return
    }
    if (pollsLeft.current <= 0) return
    pollsLeft.current -= 1
    const id = window.setTimeout(reload, PROCESSING_POLL_MS)
    return () => window.clearTimeout(id)
  }, [processingCount, detail.data, reload])

  useEffect(() => {
    const url = justPosted?.url
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [justPosted])
  useEffect(() => () => window.clearTimeout(refreshTimer.current), [])

  const handlePlay = useCallback(
    (post: PostPublic) => {
      const player = getPlayer()
      if (playingId === post.id) {
        player.toggle()
        return
      }
      // 押した投稿からスレッドの最後まで連続再生する
      const items = posts.map(toItem).filter((i): i is PlayerItem => i !== null)
      const start = items.findIndex((i) => i.id === post.id)
      if (start >= 0) player.playQueue(items, start)
    },
    [playingId, posts],
  )

  const handleShare = useCallback(
    async (post: PostPublic | null, title: string) => {
      const url = post ? sharePostUrl(post.id) : shareThreadUrl(id)
      const result = await shareLink(url, title)
      if (result === 'copied') setToast('リンクをコピーしました')
      if (result === 'failed') setToast(`リンク: ${url}`)
    },
    [id],
  )

  const threadTitle = detail.data?.thread.title ?? ''
  const sharePost = useCallback(
    (post: PostPublic) => void handleShare(post, post.title ?? `${threadTitle} #${post.seq}`),
    [handleShare, threadTitle],
  )

  const handleDelete = useCallback(
    async (post: PostPublic) => {
      const token = getDeleteToken(post.id)
      if (!token || !window.confirm(`#${post.seq} を削除しますか？元に戻せません`)) return
      try {
        await deletePost(post.id, token)
        forgetDeleteToken(post.id)
        setToast(`#${post.seq} を削除しました`)
        reload()
      } catch (err) {
        setToast(errorMessage(err))
      }
    },
    [reload],
  )

  const handleSubmit = async ({ audio, title, authorName }: RecorderSubmit) => {
    const { data } = await createReply(id, audio, {
      title,
      authorName,
      parentPostId: replyTo?.id ?? null,
    })
    if (data.post) saveDeleteToken(data.post.id, data.deleteToken)
    setReplyTo(undefined)
    // サーバの変換を待つ間は手元の録音で即時に聴けるようにする
    setJustPosted({
      url: URL.createObjectURL(audio.blob),
      label: data.post ? `#${data.post.seq}` : '',
    })
    reload()
    window.clearTimeout(refreshTimer.current)
    refreshTimer.current = window.setTimeout(reload, REFRESH_AFTER_POST_MS)
  }

  const thread = detail.data?.thread
  const back = thread ? `/t/${thread.topicSlug}` : '/'

  return (
    <>
      <PageHeader
        title={thread?.title ?? 'スレッド'}
        back={back}
        action={
          thread ? (
            <button
              type="button"
              className="text-button"
              onClick={() => void handleShare(null, thread.title)}
              aria-label="スレッドを共有"
            >
              共有
            </button>
          ) : null
        }
      />
      <main className="page">
        {thread ? <p className="lead small">{thread.topicTitle}</p> : null}
        <StatusBlock loading={detail.status === 'loading'} error={detail.error} onRetry={reload} />
        {toast ? (
          <p className="notice" role="status" onClick={() => setToast(null)}>
            {toast}
          </p>
        ) : null}
        {justPosted ? (
          <div className="notice" role="status">
            投稿しました {justPosted.label}
            <audio src={justPosted.url} controls preload="auto" className="preview-audio" />
          </div>
        ) : null}
        <ol className="post-list">
          {posts.map((p) => (
            <PostRow
              key={p.id}
              post={p}
              isCurrent={playingId === p.id}
              isPlaying={playingId === p.id && isPlaying}
              onPlay={handlePlay}
              onReply={setReplyTo}
              onJump={scrollToSeq}
              isMine={getDeleteToken(p.id) !== null}
              onShare={sharePost}
              onDelete={handleDelete}
              onReport={setReporting}
            />
          ))}
        </ol>
      </main>

      {thread && !thread.topicIsClosed ? (
        <div className="fab-area">
          <button type="button" className="primary-button fab" onClick={() => setReplyTo(null)}>
            🎙 声で返事する
          </button>
        </div>
      ) : null}

      {reporting ? (
        <ReportSheet
          seq={reporting.seq}
          onClose={() => setReporting(null)}
          onSubmit={async (reason) => {
            await reportPost(reporting.id, reason)
            setReporting(null)
            setToast('通報しました。ご協力ありがとうございます')
          }}
        />
      ) : null}

      {replyTo !== undefined ? (
        <RecorderSheet
          heading={replyTo ? `#${replyTo.seq} に返事` : '返事を録音'}
          requireTitle={false}
          replyToSeq={replyTo?.seq ?? null}
          onSubmit={handleSubmit}
          onClose={() => setReplyTo(undefined)}
        />
      ) : null}
    </>
  )
}
