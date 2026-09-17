import { Link } from 'react-router'
import { PageHeader } from '../components/Layout'

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="ページがありません" back="/" />
      <main className="page">
        <p className="empty">
          お探しのページは見つかりませんでした。<Link to="/">トップへ戻る</Link>
        </p>
      </main>
    </>
  )
}
