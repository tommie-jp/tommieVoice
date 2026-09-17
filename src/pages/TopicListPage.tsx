import { Link } from 'react-router'
import { fetchTopics } from '../api/board'
import { PageHeader, StatusBlock } from '../components/Layout'
import { useAsync } from '../hooks/useAsync'

export function TopicListPage() {
  const topics = useAsync(() => fetchTopics().then((r) => r.data), [])
  return (
    <>
      <PageHeader title="tommieVoice" />
      <main className="page">
        <p className="lead">声で書き込む掲示板。話題を選んで、声で投稿・返事しよう。</p>
        <StatusBlock
          loading={topics.status === 'loading'}
          error={topics.error}
          onRetry={topics.reload}
        />
        {topics.data?.length === 0 ? <p className="empty">まだ話題がありません</p> : null}
        <ul className="card-list">
          {topics.data?.map((t) => (
            <li key={t.id}>
              <Link to={`/t/${t.slug}`} className={`card ${t.isClosed ? 'is-closed' : ''}`}>
                <span className="card-title">{t.title}</span>
                {t.description ? <span className="card-desc">{t.description}</span> : null}
                <span className="card-meta">
                  {t.threadCount} スレッド{t.isClosed ? ' ・ 受付終了' : ''}
                  {t.scriptText ? ' ・ 台本あり' : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  )
}
