import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fail, installFakeApi, makePost, ok, THREAD, TOPIC } from '../test/fakeApi'
import { renderRoute } from '../test/renderRoute'

describe('AdminPage', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  it('stores token in sessionStorage only and logs out', async () => {
    installFakeApi([
      { path: '/api/topics', body: ok([TOPIC]) },
      { path: '/api/admin/reports', body: ok([]) },
    ])
    const user = userEvent.setup()
    renderRoute('/admin')
    await user.type(screen.getByLabelText('管理トークン'), 'secret-admin-token')
    await user.click(screen.getByRole('button', { name: '使う' }))
    expect(sessionStorage.getItem('tv.adminToken')).toBe('secret-admin-token')
    expect(localStorage.getItem('tv.adminToken')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'ログアウト' }))
    expect(sessionStorage.getItem('tv.adminToken')).toBeNull()
    expect(screen.getByLabelText('管理トークン')).toBeInTheDocument()
  })

  it('creates topic and refreshes list', async () => {
    sessionStorage.setItem('tv.adminToken', 'tok')
    const api = installFakeApi([
      { path: '/api/topics', body: ok([TOPIC]) },
      { path: '/api/admin/reports', body: ok([]) },
      { method: 'POST', path: '/api/admin/topics', status: 201, body: ok(TOPIC) },
    ])
    const user = userEvent.setup()
    renderRoute('/admin')
    await user.click(screen.getByRole('tab', { name: '話題' }))
    await user.type(screen.getByLabelText(/slug/), 'new-topic')
    await user.type(screen.getByLabelText('タイトル'), '新しい話題')
    await user.type(screen.getByLabelText('台本・お題（任意）'), '台本')
    await user.click(screen.getByRole('button', { name: '作成' }))
    await waitFor(() => expect(api.calls.filter((c) => c.url === '/api/topics')).toHaveLength(2))
    const post = api.calls.find((c) => c.init.method === 'POST')!
    expect((post.init.headers as Record<string, string>).authorization).toBe('Bearer tok')
    expect(JSON.parse(post.init.body as string)).toMatchObject({
      slug: 'new-topic',
      title: '新しい話題',
      scriptText: '台本',
    })
    expect(screen.getByLabelText(/slug/)).toHaveValue('')
  })

  it('shows create errors', async () => {
    sessionStorage.setItem('tv.adminToken', 'tok')
    installFakeApi([
      { path: '/api/topics', body: ok([]) },
      {
        method: 'POST',
        path: '/api/admin/topics',
        status: 409,
        body: fail('conflict', '同じ slug のトピックがあります'),
      },
    ])
    const user = userEvent.setup()
    renderRoute('/admin')
    await user.click(screen.getByRole('tab', { name: '話題' }))
    await user.type(screen.getByLabelText(/slug/), 'dup')
    await user.type(screen.getByLabelText('タイトル'), 'x')
    await user.click(screen.getByRole('button', { name: '作成' }))
    expect(await screen.findByText('同じ slug のトピックがあります')).toBeInTheDocument()
  })

  it('reorders and closes topics', async () => {
    sessionStorage.setItem('tv.adminToken', 'tok')
    const api = installFakeApi([
      { path: '/api/topics', body: ok([TOPIC]) },
      { method: 'PATCH', path: `/api/admin/topics/${TOPIC.id}`, body: ok(TOPIC) },
    ])
    const user = userEvent.setup()
    renderRoute('/admin')
    await user.click(screen.getByRole('tab', { name: '話題' }))
    await user.click(await screen.findByRole('button', { name: `${TOPIC.title} を下へ` }))
    await user.click(screen.getByRole('button', { name: `${TOPIC.title} を上へ` }))
    await user.click(screen.getByRole('button', { name: '受付終了' }))
    await waitFor(() => expect(api.calls.filter((c) => c.init.method === 'PATCH')).toHaveLength(3))
    const bodies = api.calls
      .filter((c) => c.init.method === 'PATCH')
      .map((c) => JSON.parse(c.init.body as string))
    expect(bodies).toEqual([{ sortOrder: 1 }, { sortOrder: -1 }, { isClosed: true }])
  })

  it('shows update errors', async () => {
    sessionStorage.setItem('tv.adminToken', 'bad')
    installFakeApi([
      { path: '/api/topics', body: ok([TOPIC]) },
      {
        method: 'PATCH',
        path: `/api/admin/topics/${TOPIC.id}`,
        status: 401,
        body: fail('unauthorized', '認証が必要です'),
      },
    ])
    const user = userEvent.setup()
    renderRoute('/admin')
    await user.click(screen.getByRole('tab', { name: '話題' }))
    await user.click(await screen.findByRole('button', { name: '受付終了' }))
    expect(await screen.findByText('認証が必要です')).toBeInTheDocument()
  })

  describe('reports tab', () => {
    const post = makePost(2)
    const adminPost = {
      id: post.id,
      threadId: THREAD.id,
      threadTitle: THREAD.title,
      topicSlug: TOPIC.slug,
      seq: 2,
      title: 'あやしい',
      authorName: null,
      status: 'ready',
      durationMs: 1500,
      createdAt: '2026-09-18T12:00:00.000Z',
      hasAudio: true,
    }
    const summary = {
      post: adminPost,
      count: 2,
      reasons: { abuse: 1, privacy: 0, copyright: 0, spam: 1, other: 0 },
      firstReportedAt: '2026-09-18T12:00:00.000Z',
    }

    beforeEach(() => sessionStorage.setItem('tv.adminToken', 'tok'))

    it('lists open reports and hides a post', async () => {
      const api = installFakeApi([
        { path: '/api/topics', body: ok([]) },
        { path: '/api/admin/reports', body: ok([summary]) },
        {
          method: 'PATCH',
          path: `/api/admin/posts/${post.id}`,
          body: ok({ ...adminPost, status: 'hidden' }),
        },
      ])
      const user = userEvent.setup()
      renderRoute('/admin')
      const row = await screen.findByRole('listitem', { name: `${THREAD.title} #2 の通報` })
      expect(row).toHaveTextContent('誹謗中傷・嫌がらせ ×1 / 宣伝・スパム ×1')
      expect(row).toHaveTextContent('通報 2 件')
      await user.click(screen.getByRole('button', { name: '非表示' }))
      await waitFor(() =>
        expect(api.calls.filter((c) => c.url === '/api/admin/reports')).toHaveLength(2),
      )
      const patch = api.calls.find((c) => c.init.method === 'PATCH')!
      expect(JSON.parse(patch.init.body as string)).toEqual({ status: 'hidden' })
    })

    it('restores hidden posts, resolves reports and deletes after confirming', async () => {
      const api = installFakeApi([
        { path: '/api/topics', body: ok([]) },
        {
          path: '/api/admin/reports',
          body: ok([{ ...summary, post: { ...adminPost, status: 'hidden' } }]),
        },
        { method: 'PATCH', path: `/api/admin/posts/${post.id}`, body: ok(adminPost) },
        {
          method: 'POST',
          path: `/api/admin/posts/${post.id}/resolve-reports`,
          body: ok({ postId: post.id, resolved: 2 }),
        },
      ])
      const confirm = vi
        .spyOn(window, 'confirm')
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true)
      const user = userEvent.setup()
      renderRoute('/admin')
      await user.click(await screen.findByRole('button', { name: '戻す' }))
      await user.click(await screen.findByRole('button', { name: '問題なし' }))
      await user.click(await screen.findByRole('button', { name: '削除' }))
      await user.click(await screen.findByRole('button', { name: '削除' }))
      await waitFor(() =>
        expect(api.calls.filter((c) => c.init.method === 'PATCH')).toHaveLength(2),
      )
      const bodies = api.calls
        .filter((c) => c.init.method === 'PATCH')
        .map((c) => JSON.parse(c.init.body as string))
      expect(bodies).toEqual([{ status: 'ready' }, { status: 'deleted' }])
      expect(api.calls.some((c) => c.url.endsWith('/resolve-reports'))).toBe(true)
      confirm.mockRestore()
    })

    it('plays the reported audio through the admin endpoint and shows failures', async () => {
      installFakeApi([
        { path: '/api/topics', body: ok([]) },
        { path: '/api/admin/reports', body: ok([summary]) },
        {
          method: 'PATCH',
          path: `/api/admin/posts/${post.id}`,
          status: 409,
          body: fail('conflict', '戻せません'),
        },
      ])
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response(new Blob(['a']), { status: 200 }))
        .mockResolvedValueOnce(new Response('x', { status: 404 }))
        .mockRejectedValueOnce(new TypeError('offline'))
      const user = userEvent.setup()
      renderRoute('/admin')
      await user.click(await screen.findByRole('button', { name: '試聴' }))
      expect(await screen.findByLabelText('通報された音声')).toBeInTheDocument()
      expect(fetchSpy.mock.calls[0]![1]!.headers).toMatchObject({ authorization: 'Bearer tok' })
      await user.click(screen.getByRole('button', { name: '試聴' }))
      expect(await screen.findByText('音声を取得できませんでした')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '試聴' }))
      expect(await screen.findByText('通信できませんでした')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '非表示' }))
      expect(await screen.findByText('戻せません')).toBeInTheDocument()
      fetchSpy.mockRestore()
    })

    it('shows an empty state', async () => {
      installFakeApi([
        { path: '/api/topics', body: ok([]) },
        { path: '/api/admin/reports', body: ok([]) },
      ])
      renderRoute('/admin')
      expect(await screen.findByText('未対応の通報はありません')).toBeInTheDocument()
    })
  })
})

describe('AdminPage streamers tab', () => {
  const S = {
    id: '40000000-0000-4000-8000-000000000001',
    displayName: 'とみー',
    createdAt: '2026-09-18T12:00:00.000Z',
    disabled: false,
  }

  beforeEach(() => sessionStorage.setItem('tv.adminToken', 'tok'))

  it('issues a streamer and shows the key once', async () => {
    const api = installFakeApi([
      { path: '/api/topics', body: ok([]) },
      { path: '/api/admin/reports', body: ok([]) },
      { path: '/api/admin/streamers', body: ok([S]) },
      {
        method: 'POST',
        path: '/api/admin/streamers',
        status: 201,
        body: ok({ streamer: S, loginKey: 'KEY-'.padEnd(43, 'x') }),
      },
    ])
    const user = userEvent.setup()
    renderRoute('/admin')
    await user.click(screen.getByRole('tab', { name: '配信者' }))
    expect(await screen.findByText('有効')).toBeInTheDocument()
    await user.type(screen.getByLabelText('表示名'), 'とみー')
    await user.click(screen.getByRole('button', { name: '発行' }))
    expect(await screen.findByText('KEY-'.padEnd(43, 'x'))).toBeInTheDocument()
    expect(
      JSON.parse(api.calls.find((c) => c.init.method === 'POST')!.init.body as string),
    ).toEqual({ displayName: 'とみー' })
    await user.click(screen.getByRole('button', { name: '控えたので閉じる' }))
    expect(screen.queryByText('KEY-'.padEnd(43, 'x'))).not.toBeInTheDocument()
  })

  it('rotates keys after confirming and toggles disabled', async () => {
    const api = installFakeApi([
      { path: '/api/topics', body: ok([]) },
      { path: '/api/admin/reports', body: ok([]) },
      { path: '/api/admin/streamers', body: ok([S]) },
      {
        method: 'POST',
        path: `/api/admin/streamers/${S.id}/rotate-key`,
        body: ok({ streamer: S, loginKey: 'NEW'.padEnd(43, 'y') }),
      },
      { method: 'PATCH', path: `/api/admin/streamers/${S.id}`, body: ok({ ...S, disabled: true }) },
    ])
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    const user = userEvent.setup()
    renderRoute('/admin')
    await user.click(screen.getByRole('tab', { name: '配信者' }))
    await user.click(await screen.findByRole('button', { name: 'キー再発行' }))
    expect(api.calls.some((c) => c.url.endsWith('rotate-key'))).toBe(false)
    await user.click(screen.getByRole('button', { name: 'キー再発行' }))
    expect(await screen.findByText('NEW'.padEnd(43, 'y'))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '停止' }))
    await waitFor(() => expect(api.calls.some((c) => c.init.method === 'PATCH')).toBe(true))
    confirm.mockRestore()
  })

  it('shows errors when issuing fails', async () => {
    installFakeApi([
      { path: '/api/topics', body: ok([]) },
      { path: '/api/admin/reports', body: ok([]) },
      { path: '/api/admin/streamers', body: ok([S]) },
      {
        method: 'POST',
        path: '/api/admin/streamers',
        status: 401,
        body: fail('unauthorized', '認証が必要です'),
      },
      {
        method: 'PATCH',
        path: `/api/admin/streamers/${S.id}`,
        status: 404,
        body: fail('not_found', '配信者が見つかりません'),
      },
    ])
    const user = userEvent.setup()
    renderRoute('/admin')
    await user.click(screen.getByRole('tab', { name: '配信者' }))
    await user.type(screen.getByLabelText('表示名'), 'x')
    await user.click(screen.getByRole('button', { name: '発行' }))
    expect(await screen.findByText('認証が必要です')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: '停止' }))
    expect(await screen.findByText('配信者が見つかりません')).toBeInTheDocument()
  })

  it('creates an inbox topic for a streamer', async () => {
    const api = installFakeApi([
      { path: '/api/topics', body: ok([{ ...TOPIC, mode: 'inbox', ownerName: 'とみー' }]) },
      { path: '/api/admin/reports', body: ok([]) },
      {
        path: '/api/admin/streamers',
        body: ok([
          S,
          {
            ...S,
            id: '40000000-0000-4000-8000-000000000002',
            displayName: '停止中の人',
            disabled: true,
          },
        ]),
      },
      { method: 'POST', path: '/api/admin/topics', status: 201, body: ok(TOPIC) },
    ])
    const user = userEvent.setup()
    renderRoute('/admin')
    await user.click(screen.getByRole('tab', { name: '話題' }))
    expect(await screen.findByText(/凸待ち箱（とみー）/)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/slug/), 'tomi-box')
    await user.type(screen.getByLabelText('タイトル'), 'とみーの凸待ち')
    const select = screen.getByLabelText('種類')
    expect(within(select).queryByText('凸待ち箱: 停止中の人')).not.toBeInTheDocument()
    await user.selectOptions(select, S.id)
    await user.click(screen.getByRole('button', { name: '作成' }))
    await waitFor(() => expect(api.calls.some((c) => c.init.method === 'POST')).toBe(true))
    expect(
      JSON.parse(api.calls.find((c) => c.init.method === 'POST')!.init.body as string),
    ).toMatchObject({
      mode: 'inbox',
      ownerId: S.id,
    })
  })
})
