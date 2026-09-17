import type { ReactNode } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { APP_COMMIT_COUNTER, APP_VERSION } from '../../shared/appVersion.ts'
import { ConsolePanel } from './ConsolePanel'
import { PlayerBar } from './player/PlayerBar'
import { StandaloneNotice } from './StandaloneNotice'

export function PageHeader({
  title,
  back,
  action,
}: {
  title: string
  back?: string
  action?: ReactNode
}) {
  return (
    <header className="page-header">
      {back ? (
        <Link to={back} className="back-link" aria-label="戻る">
          ‹
        </Link>
      ) : (
        <span className="back-spacer" />
      )}
      <h1 className="page-title">{title}</h1>
      <div className="header-action">{action}</div>
    </header>
  )
}

export function Layout() {
  const { search } = useLocation()
  const debug = new URLSearchParams(search).has('debug')
  return (
    <div className="app">
      <StandaloneNotice />
      <Outlet />
      <footer className="app-foot">
        <span className="foot-links">
          <Link to="/mine">自分の投稿</Link>
          <Link to="/streamer">配信者</Link>
          <Link to="/terms">利用規約</Link>
        </span>
        <span className="app-version">
          v{APP_VERSION} #{APP_COMMIT_COUNTER}
        </span>
      </footer>
      <PlayerBar />
      {debug ? <ConsolePanel /> : null}
    </div>
  )
}

export function StatusBlock({
  loading,
  error,
  onRetry,
}: {
  loading: boolean
  error: string | null
  onRetry?: () => void
}) {
  if (loading) {
    return (
      <p className="status-block" aria-busy="true">
        読み込み中…
      </p>
    )
  }
  if (error) {
    return (
      <div className="status-block" role="alert">
        <p>{error}</p>
        {onRetry ? (
          <button type="button" className="secondary-button" onClick={onRetry}>
            再読み込み
          </button>
        ) : null}
      </div>
    )
  }
  return null
}
