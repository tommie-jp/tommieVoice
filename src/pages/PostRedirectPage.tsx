import { Navigate, useParams } from 'react-router'
import { fetchPost } from '../api/board'
import { PageHeader, StatusBlock } from '../components/Layout'
import { useAsync } from '../hooks/useAsync'

/** 共有 URL /posts/:id はスレッドの該当位置へ移動する */
export function PostRedirectPage() {
  const { id = '' } = useParams()
  const post = useAsync(() => fetchPost(id).then((r) => r.data), [id])
  if (post.data) return <Navigate to={`/threads/${post.data.threadId}#p${post.data.seq}`} replace />
  return (
    <>
      <PageHeader title="投稿" back="/" />
      <main className="page">
        <StatusBlock loading={post.status === 'loading'} error={post.error} />
      </main>
    </>
  )
}
