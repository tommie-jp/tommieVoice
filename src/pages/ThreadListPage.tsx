import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { ThreadSummary } from '../../shared/schemas/thread.ts'
import { createThread, fetchThreads, fetchTopics } from '../api/board'
import { errorMessage } from '../api/client'
import { PageHeader, StatusBlock } from '../components/Layout'
import { RecorderSheet, type RecorderSubmit } from '../components/recorder/RecorderSheet'
import { useAsync } from '../hooks/useAsync'
import { formatRelative } from '../lib/format'
import { saveDeleteToken } from '../lib/postTokens'

/** 話題を切り替えたら状態を作り直す */
export function ThreadListPage() {
  const { slug = '' } = useParams()
  return <ThreadListView key={slug} slug={slug} />
}

function ThreadListView({ slug }: { slug: string }) {
  const navigate = useNavigate()
  const [composing, setComposing] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [more, setMore] = useState<{
    items: ThreadSummary[]
    cursor: string | null
    error: string | null
    loading: boolean
  }>({ items: [], cursor: null, error: null, loading: false })

  const topic = useAsync(
    () => fetchTopics().then((r) => r.data.find((t) => t.slug === slug) ?? null),
    [slug],
  )
  const first = useAsync(async () => {
    const r = await fetchThreads(slug)
    setMore({ items: [], cursor: r.meta?.nextCursor ?? null, error: null, loading: false })
    return r.data
  }, [slug])

  const loadMore = useCallback(async () => {
    const cursor = more.cursor
    if (!cursor || more.loading) return
    setMore((prev) => ({ ...prev, loading: true }))
    try {
      const r = await fetchThreads(slug, cursor)
      // 再読み込みで cursor が変わっていたら古い結果は捨てる
      setMore((prev) =>
        prev.cursor !== cursor
          ? prev
          : {
              items: [...prev.items, ...r.data],
              cursor: r.meta?.nextCursor ?? null,
              error: null,
              loading: false,
            },
      )
    } catch (err) {
      setMore((prev) => ({ ...prev, error: errorMessage(err), loading: false }))
    }
  }, [slug, more.cursor, more.loading])

  const handleSubmit = async ({ audio, title, authorName }: RecorderSubmit) => {
    const { data } = await createThread(slug, audio, { title: title ?? '', authorName })
    if (!data.post)
      throw new Error('音声を処理できませんでした。別の端末やブラウザで試してください')
    saveDeleteToken(data.post.id, data.deleteToken)
    setComposing(false)
    if (data.post.reviewStatus === 'pending') {
      setAccepted(true)
      return
    }
    navigate(`/threads/${data.post.threadId}`)
  }

  const info = topic.data
  const threads = [...(first.data ?? []), ...more.items]
  const closed = info?.isClosed ?? false

  return (
    <>
      <PageHeader title={info?.title ?? '話題'} back="/" />
      <main className="page">
        {topic.status === 'ready' && info === null ? (
          <p className="empty">話題が見つかりません</p>
        ) : null}
        {info?.mode === 'inbox' ? (
          <p className="notice inbox-notice">
            📮 {info.ownerName ?? '配信者'}
            さんの凸待ち箱です。届いた声は配信者が聴いて、配信で紹介されると公開されます。
          </p>
        ) : null}
        {accepted ? (
          <p className="notice" role="status">
            受け付けました。配信で紹介されると公開されます。状況は<Link to="/mine">自分の投稿</Link>
            で確認できます。
          </p>
        ) : null}
        {info?.description ? <p className="lead">{info.description}</p> : null}
        {info?.scriptText ? (
          <details className="script-box" open>
            <summary>台本・お題</summary>
            <p className="script-text">{info.scriptText}</p>
          </details>
        ) : null}

        <StatusBlock
          loading={first.status === 'loading'}
          error={first.error}
          onRetry={first.reload}
        />
        {first.status === 'ready' && threads.length === 0 ? (
          <p className="empty">まだ投稿がありません。最初の声を届けよう</p>
        ) : null}
        <ul className="card-list">
          {threads.map((t) => (
            <li key={t.id}>
              <Link to={`/threads/${t.id}`} className="card">
                <span className="card-title">{t.title}</span>
                <span className="card-meta">
                  {t.postCount} 件 ・ {formatRelative(t.lastPostAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {more.error ? (
          <p className="form-error" role="alert">
            {more.error}
          </p>
        ) : null}
        {more.cursor ? (
          <button
            type="button"
            className="secondary-button wide"
            onClick={loadMore}
            disabled={more.loading}
          >
            {more.loading ? '読み込み中…' : 'もっと見る'}
          </button>
        ) : null}
      </main>

      {info && !closed ? (
        <div className="fab-area">
          <button type="button" className="primary-button fab" onClick={() => setComposing(true)}>
            {info.mode === 'inbox' ? '🎙 声を届ける' : '🎙 声でスレッドを立てる'}
          </button>
        </div>
      ) : null}
      {closed ? <p className="closed-note">この話題は受付を終了しました</p> : null}

      {composing && info ? (
        <RecorderSheet
          heading={info.mode === 'inbox' ? '凸待ち箱に声を届ける' : '新しいスレッド'}
          requireTitle
          scriptText={info.scriptText}
          onSubmit={handleSubmit}
          onClose={() => setComposing(false)}
        />
      ) : null}
    </>
  )
}
