import type { RouteObject } from 'react-router'
import { Layout } from './components/Layout'
import { AdminPage } from './pages/AdminPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PostRedirectPage } from './pages/PostRedirectPage'
import { TermsPage } from './pages/TermsPage'
import { ThreadListPage } from './pages/ThreadListPage'
import { ThreadPage } from './pages/ThreadPage'
import { TopicListPage } from './pages/TopicListPage'
import { MyPostsPage } from './pages/MyPostsPage'
import { TranscribeLabPage } from './pages/lab/TranscribeLabPage'
import { OverlayPage } from './pages/OverlayPage'
import { StreamerDashboardPage } from './pages/streamer/StreamerDashboardPage'
import { StreamerLoginPage } from './pages/streamer/StreamerLoginPage'

export const routes: RouteObject[] = [
  // OBS 用。共通レイアウト（フッタ・プレイヤー）を出さない
  { path: '/overlay/:token', element: <OverlayPage /> },
  {
    element: <Layout />,
    children: [
      { path: '/', element: <TopicListPage /> },
      { path: '/t/:slug', element: <ThreadListPage /> },
      { path: '/threads/:id', element: <ThreadPage /> },
      { path: '/posts/:id', element: <PostRedirectPage /> },
      { path: '/admin', element: <AdminPage /> },
      { path: '/mine', element: <MyPostsPage /> },
      { path: '/streamer', element: <StreamerDashboardPage /> },
      { path: '/streamer/login', element: <StreamerLoginPage /> },
      { path: '/terms', element: <TermsPage /> },
      { path: '/lab/transcribe', element: <TranscribeLabPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
