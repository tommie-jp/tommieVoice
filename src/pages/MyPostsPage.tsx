import { Link } from 'react-router'
import type { PostPublic } from '../../shared/schemas/post.ts'
import { fetchMyPosts } from '../api/board'
import { AiredBadge } from '../components/board/AiredBadge'
import { PageHeader, StatusBlock } from '../components/Layout'
import { useAsync } from '../hooks/useAsync'
import { formatDuration, formatRelative } from '../lib/format'
import { listDeleteTokens } from '../lib/postTokens'

const REVIEW_LABELS: Readonly<Record<NonNullable<PostPublic['reviewStatus']>, string>> = {
  pending: '受付済み（配信者の確認待ち）',
  approved: '採用されました（配信で紹介されるのを待っています）',
  rejected: '今回は紹介されませんでした',
  aired: '',
}

function statusText(post: PostPublic): string {
  if (post.status === 'processing') return '変換中…'
  if (post.reviewStatus) return REVIEW_LABELS[post.reviewStatus]
  return '公開中'
}

/** この端末から投稿した声の状態（凸待ち箱の審査結果を含む） */
export function MyPostsPage() {
  const posts = useAsync(async () => {
    const tokens = listDeleteTokens()
    if (tokens.length === 0) return []
    return (await fetchMyPosts(tokens)).data
  }, [])

  return (
    <>
      <PageHeader title="自分の投稿" back="/" />
      <main className="page">
        <p className="lead small">この端末から投稿した声だけが表示されます。</p>
        <StatusBlock
          loading={posts.status === 'loading'}
          error={posts.error}
          onRetry={posts.reload}
        />
        {posts.data?.length === 0 ? <p className="empty">まだ投稿がありません</p> : null}
        <ul className="card-list">
          {posts.data?.map((p) => {
            const visible = p.reviewStatus === null || p.reviewStatus === 'aired'
            return (
              <li key={p.id} className="card">
                <span className="card-title">{p.title ?? `#${p.seq}`}</span>
                <span className="card-meta">
                  {formatRelative(p.createdAt)} ・ {formatDuration(p.durationMs)}
                </span>
                {p.reviewStatus === 'aired' ? <AiredBadge airedRef={p.airedRef} /> : null}
                <span className="card-meta">{statusText(p)}</span>
                {visible ? <Link to={`/posts/${p.id}`}>開く</Link> : null}
              </li>
            )
          })}
        </ul>
      </main>
    </>
  )
}
