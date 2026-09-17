import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setPlayerForTest } from '../../hooks/usePlayer'
import { createPlayer } from '../../lib/player'
import { fail, installFakeApi, makePost, ok, THREAD, TOPIC } from '../../test/fakeApi'
import { renderRoute } from '../../test/renderRoute'

vi.mock('../../lib/audioRecorder', async (orig) => {
  const actual = await orig<typeof import('../../lib/audioRecorder')>()
  const { fakeRecorder } = await import('../../test/fakeRecorder')
  return {
    ...actual,
    AudioRecorder: vi.fn(function FakeAudioRecorder() {
      return fakeRecorder()
    }),
  }
})

const ME = {
  id: '40000000-0000-4000-8000-000000000001',
  displayName: 'とみー',
  createdAt: '2026-09-18T12:00:00.000Z',
  disabled: false,
  counts: { pending: 2, approved: 1, rejected: 0, aired: 3 },
}
const STATUS = { waiting: 4, leased: 1, failed: 1, lastWorkerSeenAt: '2026-09-18T11:58:00.000Z' }

function item(seq: number, patch: Record<string, unknown> = {}) {
  return {
    post: makePost(seq, { reviewStatus: 'pending', seq: 1 }),
    threadId: THREAD.id,
    threadTitle: `凸${seq}`,
    topicSlug: TOPIC.slug,
    topicTitle: TOPIC.title,
    queueOrder: null,
    transcript: {
      text: `全文${seq} こんばんは、質問です。`,
      summary: `要約${seq}`,
      tags: ['question'],
      riskFlags: seq === 2 ? ['contact_info'] : [],
      segments: [],
    },
    transcriptState: 'done',
    ...patch,
  }
}

function baseRoutes(extra: Parameters<typeof installFakeApi>[0] = []) {
  return installFakeApi([
    { path: '/api/streamer/me', body: ok(ME) },
    { path: '/api/streamer/transcription-status', body: ok(STATUS) },
    { path: '/api/streamer/inbox?status=pending', body: ok([item(1), item(2)]) },
    {
      path: '/api/streamer/inbox?status=approved',
      body: ok([
        item(3, { queueOrder: 1, post: makePost(3, { reviewStatus: 'approved', seq: 1 }) }),
        item(4, { queueOrder: 2, post: makePost(4, { reviewStatus: 'approved', seq: 1 }) }),
      ]),
    },
    {
      path: '/api/streamer/inbox?status=aired',
      body: ok([
        item(5, {
          post: makePost(5, { reviewStatus: 'aired', airedRef: 'https://youtu.be/x', seq: 1 }),
        }),
      ]),
    },
    { path: '/api/streamer/inbox?status=rejected', body: ok([]) },
    ...extra,
  ])
}

beforeEach(() => {
  setPlayerForTest(createPlayer(document.createElement('audio')))
})

describe('StreamerLoginPage', () => {
  it('logs in with the key and opens the dashboard', async () => {
    const api = baseRoutes([
      {
        method: 'POST',
        path: '/api/streamer/session',
        body: ok({
          id: ME.id,
          displayName: ME.displayName,
          createdAt: ME.createdAt,
          disabled: false,
        }),
      },
    ])
    const user = userEvent.setup()
    const { router } = renderRoute('/streamer/login')
    const submit = screen.getByRole('button', { name: 'ログイン' })
    expect(submit).toBeDisabled()
    await user.type(screen.getByLabelText(/ログインキー/), 'k'.repeat(43))
    await user.click(submit)
    await waitFor(() => expect(router.state.location.pathname).toBe('/streamer'))
    const call = api.calls.find((c) => c.init.method === 'POST')!
    expect((call.init.headers as Record<string, string>)['x-requested-with']).toBe('tommieVoice')
    expect(JSON.parse(call.init.body as string)).toEqual({ loginKey: 'k'.repeat(43) })
  })

  it('shows login errors', async () => {
    installFakeApi([
      {
        method: 'POST',
        path: '/api/streamer/session',
        status: 401,
        body: fail('unauthorized', '認証が必要です'),
      },
    ])
    const user = userEvent.setup()
    renderRoute('/streamer/login')
    await user.type(screen.getByLabelText(/ログインキー/), 'k'.repeat(43))
    await user.click(screen.getByRole('button', { name: 'ログイン' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('認証が必要です')
  })
})

describe('StreamerDashboardPage', () => {
  it('redirects to login without a session', async () => {
    installFakeApi([
      { path: '/api/streamer/me', status: 401, body: fail('unauthorized', '認証が必要です') },
      { path: /inbox|transcription/, status: 401, body: fail('unauthorized', '認証が必要です') },
    ])
    const { router } = renderRoute('/streamer')
    await waitFor(() => expect(router.state.location.pathname).toBe('/streamer/login'))
  })

  it('shows counts, transcription status and pending items with risk badges', async () => {
    baseRoutes()
    const user = userEvent.setup()
    renderRoute('/streamer')
    expect(await screen.findByRole('heading', { name: 'とみー の凸待ち箱' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '未処理 2' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('region', { name: '文字起こし' })).toHaveTextContent(
      '文字起こし待ち 4 件 ・ 処理中 1 件 ・ 失敗 1 件',
    )
    const risky = await screen.findByRole('listitem', { name: '凸2' })
    expect(risky).toHaveClass('is-risky')
    expect(within(risky).getByText('⚠ 連絡先')).toBeInTheDocument()
    const summary = within(risky).getByRole('button', { name: '要約2' })
    await user.click(summary)
    expect(summary).toHaveTextContent('全文2')
  })

  it('approves and rejects pending items', async () => {
    const api = baseRoutes([
      { method: 'PATCH', path: new RegExp(`/api/streamer/posts/`), body: ok(item(1)) },
    ])
    const user = userEvent.setup()
    renderRoute('/streamer')
    const first = await screen.findByRole('listitem', { name: '凸1' })
    await user.click(within(first).getByRole('button', { name: '採用' }))
    await user.click(
      within(await screen.findByRole('listitem', { name: '凸2' })).getByRole('button', {
        name: '却下',
      }),
    )
    await waitFor(() => expect(api.calls.filter((c) => c.init.method === 'PATCH')).toHaveLength(2))
    const bodies = api.calls
      .filter((c) => c.init.method === 'PATCH')
      .map((c) => JSON.parse(c.init.body as string))
    expect(bodies).toEqual([{ reviewStatus: 'approved' }, { reviewStatus: 'rejected' }])
    expect(
      (api.calls.find((c) => c.init.method === 'PATCH')!.init.headers as Record<string, string>)[
        'x-requested-with'
      ],
    ).toBe('tommieVoice')
  })

  it('airs, reorders and holds approved items', async () => {
    const api = baseRoutes([
      { method: 'PATCH', path: /\/api\/streamer\/posts\//, body: ok(item(3)) },
      { method: 'POST', path: /\/air$/, body: ok(item(3)) },
    ])
    const user = userEvent.setup()
    renderRoute('/streamer')
    await user.click(await screen.findByRole('tab', { name: '採用 1' }))
    const third = await screen.findByRole('listitem', { name: '凸3' })
    await user.click(within(third).getByRole('button', { name: '凸3 を下へ' }))
    await waitFor(() => expect(api.calls.filter((c) => c.init.method === 'PATCH')).toHaveLength(2))
    const swaps = api.calls
      .filter((c) => c.init.method === 'PATCH')
      .map((c) => [c.url.split('/').at(-1), JSON.parse(c.init.body as string)])
    expect(swaps).toEqual([
      [makePost(3).id, { queueOrder: 2 }],
      [makePost(4).id, { queueOrder: 1 }],
    ])
    await user.click(
      within(await screen.findByRole('listitem', { name: '凸3' })).getByRole('button', {
        name: '今流す',
      }),
    )
    await waitFor(() => expect(api.calls.some((c) => c.url.endsWith('/air'))).toBe(true))
    await user.click(
      within(await screen.findByRole('listitem', { name: '凸4' })).getByRole('button', {
        name: '保留',
      }),
    )
    await waitFor(() => expect(api.calls.filter((c) => c.init.method === 'PATCH')).toHaveLength(3))
    // 先頭で上へ押しても何も送らない
    await user.click(
      within(await screen.findByRole('listitem', { name: '凸3' })).getByRole('button', {
        name: '凸3 を上へ',
      }),
    )
    expect(api.calls.filter((c) => c.init.method === 'PATCH')).toHaveLength(3)
  })

  it('edits the aired url and shows errors', async () => {
    const api = baseRoutes([
      {
        method: 'PATCH',
        path: /\/api\/streamer\/posts\//,
        status: 400,
        body: fail('validation_error', 'airedRef が不正です'),
      },
    ])
    const user = userEvent.setup()
    renderRoute('/streamer')
    await user.click(await screen.findByRole('tab', { name: '配信済み 3' }))
    const row = await screen.findByRole('listitem', { name: '凸5' })
    expect(within(row).getByRole('link', { name: /配信で紹介されました/ })).toHaveAttribute(
      'href',
      'https://youtu.be/x',
    )
    const input = within(row).getByLabelText('凸5 の配信 URL')
    await user.clear(input)
    await user.type(input, 'https://twitch.tv/v/1')
    await user.click(within(row).getByRole('button', { name: '保存' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('airedRef が不正です')
    expect(
      JSON.parse(api.calls.find((c) => c.init.method === 'PATCH')!.init.body as string),
    ).toEqual({ airedRef: 'https://twitch.tv/v/1' })
  })

  it('plays an item through the shared player and shows empty tabs', async () => {
    baseRoutes()
    const user = userEvent.setup()
    renderRoute('/streamer')
    await user.click(await screen.findByRole('button', { name: '凸1 を再生' }))
    expect(await screen.findByRole('region', { name: '再生中' })).toHaveTextContent('凸1')
    await user.click(screen.getByRole('button', { name: '凸1 を一時停止' }))
    await user.click(screen.getByRole('tab', { name: '却下 0' }))
    expect(await screen.findByText('却下の声はありません')).toBeInTheDocument()
  })

  it('logs out', async () => {
    const api = baseRoutes([
      { method: 'DELETE', path: '/api/streamer/session', body: ok({ loggedOut: true }) },
    ])
    const user = userEvent.setup()
    const { router } = renderRoute('/streamer')
    await user.click(await screen.findByRole('button', { name: 'ログアウト' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/streamer/login'))
    expect(api.calls.some((c) => c.init.method === 'DELETE')).toBe(true)
  })

  it('refreshes periodically', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const api = baseRoutes()
    renderRoute('/streamer')
    await screen.findByRole('listitem', { name: '凸1' })
    const before = api.calls.length
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    await waitFor(() => expect(api.calls.length).toBeGreaterThan(before))
    vi.useRealTimers()
  })
})

describe('MyPostsPage and inbox posting', () => {
  beforeEach(() => localStorage.clear())

  it('lists own posts with review states', async () => {
    const pending = makePost(1, { reviewStatus: 'pending', title: '届けた声' })
    const aired = makePost(2, {
      reviewStatus: 'aired',
      airedRef: 'https://youtu.be/y',
      title: '紹介された声',
    })
    const board = makePost(3, { title: '普通の声' })
    localStorage.setItem(
      'tv.deleteTokens',
      JSON.stringify({
        [pending.id]: 'a'.repeat(43),
        [aired.id]: 'b'.repeat(43),
        [board.id]: 'c'.repeat(43),
      }),
    )
    const api = installFakeApi([
      { method: 'POST', path: '/api/posts/mine', body: ok([pending, aired, board]) },
    ])
    renderRoute('/mine')
    const pendingCard = (await screen.findByText('届けた声')).closest('li')!
    expect(pendingCard).toHaveTextContent('受付済み')
    expect(within(pendingCard).queryByRole('link', { name: '開く' })).not.toBeInTheDocument()
    const airedCard = screen.getByText('紹介された声').closest('li')!
    expect(within(airedCard).getByRole('link', { name: /配信で紹介/ })).toHaveAttribute(
      'href',
      'https://youtu.be/y',
    )
    expect(
      within(screen.getByText('普通の声').closest('li')!).getByText('公開中'),
    ).toBeInTheDocument()
    expect(JSON.parse(api.calls[0]!.init.body as string).items).toHaveLength(3)
  })

  it('shows an empty state without calling the API', async () => {
    const api = installFakeApi([])
    renderRoute('/mine')
    expect(await screen.findByText('まだ投稿がありません')).toBeInTheDocument()
    expect(api.calls).toHaveLength(0)
  })

  it('shows the accepted message after posting to an inbox', async () => {
    const inbox = { ...TOPIC, mode: 'inbox', publishOn: 'aired', ownerName: 'とみー' }
    installFakeApi([
      { path: '/api/topics', body: ok([inbox]) },
      { path: '/api/topics/seiyu/threads', body: ok([], { nextCursor: null }) },
      {
        method: 'POST',
        path: '/api/topics/seiyu/threads',
        status: 201,
        body: ok({
          thread: null,
          post: makePost(1, { reviewStatus: 'pending' }),
          deleteToken: 'd'.repeat(43),
        }),
      },
    ])
    const user = userEvent.setup()
    const { router } = renderRoute('/t/seiyu')
    expect(await screen.findByText(/とみーさんの凸待ち箱です/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '🎙 声を届ける' }))
    const dialog = screen.getByRole('dialog', { name: '凸待ち箱に声を届ける' })
    await user.type(within(dialog).getByLabelText('タイトル'), '質問です')
    await user.click(within(dialog).getByRole('button', { name: '録音' }))
    await user.click(await within(dialog).findByRole('button', { name: '停止' }))
    await user.click(await within(dialog).findByRole('button', { name: '投稿する' }))
    expect(await screen.findByRole('status')).toHaveTextContent('受け付けました')
    expect(router.state.location.pathname).toBe('/t/seiyu')
  })
})
