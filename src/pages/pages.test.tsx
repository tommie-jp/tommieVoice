import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setPlayerForTest } from '../hooks/usePlayer'
import { createPlayer } from '../lib/player'
import { fail, installFakeApi, makePost, ok, THREAD, TOPIC } from '../test/fakeApi'
import { renderRoute } from '../test/renderRoute'

vi.mock('../lib/audioRecorder', async (orig) => {
  const actual = await orig<typeof import('../lib/audioRecorder')>()
  const { fakeRecorder } = await import('../test/fakeRecorder')
  return {
    ...actual,
    AudioRecorder: vi.fn(function FakeAudioRecorder() {
      return fakeRecorder()
    }),
  }
})

const TOPICS = { path: '/api/topics', body: ok([TOPIC]) }

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  setPlayerForTest(createPlayer(document.createElement('audio')))
})

describe('TopicListPage', () => {
  it('lists topics with links', async () => {
    installFakeApi([TOPICS])
    renderRoute('/')
    const link = await screen.findByRole('link', { name: /ネット声優/ })
    expect(link).toHaveAttribute('href', '/t/seiyu')
    expect(link).toHaveTextContent('台本あり')
  })

  it('shows an error with retry', async () => {
    const api = installFakeApi([
      { path: '/api/topics', status: 500, body: fail('internal_error', '落ちています') },
    ])
    const user = userEvent.setup()
    renderRoute('/')
    expect(await screen.findByText('落ちています')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '再読み込み' }))
    await waitFor(() => expect(api.calls).toHaveLength(2))
  })

  it('shows an empty state', async () => {
    installFakeApi([{ path: '/api/topics', body: ok([]) }])
    renderRoute('/')
    expect(await screen.findByText('まだ話題がありません')).toBeInTheDocument()
  })

  it('shows the debug console only with ?debug', async () => {
    installFakeApi([TOPICS])
    renderRoute('/?debug=1')
    expect(await screen.findByRole('region', { name: 'コンソールログ' })).toBeInTheDocument()
  })
})

describe('ThreadListPage', () => {
  it('shows the script, threads and loads more', async () => {
    const second = { ...THREAD, id: '20000000-0000-4000-8000-000000000002', title: '二つ目' }
    installFakeApi([
      TOPICS,
      { path: '/api/topics/seiyu/threads', body: ok([THREAD], { nextCursor: 'c1' }) },
      { path: '/api/topics/seiyu/threads?cursor=c1', body: ok([second], { nextCursor: null }) },
    ])
    const user = userEvent.setup()
    renderRoute('/t/seiyu')
    expect(await screen.findByText('「ここは任せて先に行け！」')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /最初の声/ })).toHaveAttribute(
      'href',
      `/threads/${THREAD.id}`,
    )
    await user.click(screen.getByRole('button', { name: 'もっと見る' }))
    expect(await screen.findByRole('link', { name: /二つ目/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'もっと見る' })).not.toBeInTheDocument()
  })

  it('reports load-more failures', async () => {
    installFakeApi([
      TOPICS,
      { path: '/api/topics/seiyu/threads', body: ok([THREAD], { nextCursor: 'c1' }) },
      {
        path: '/api/topics/seiyu/threads?cursor=c1',
        status: 400,
        body: fail('bad_request', 'cursor が不正です'),
      },
    ])
    const user = userEvent.setup()
    renderRoute('/t/seiyu')
    await user.click(await screen.findByRole('button', { name: 'もっと見る' }))
    expect(await screen.findByText('cursor が不正です')).toBeInTheDocument()
  })

  it('records a new thread, stores the delete token and opens it', async () => {
    const created = { thread: THREAD, post: makePost(1), deleteToken: 'd'.repeat(43) }
    const api = installFakeApi([
      TOPICS,
      { path: '/api/topics/seiyu/threads', body: ok([], { nextCursor: null }) },
      { method: 'POST', path: '/api/topics/seiyu/threads', status: 201, body: ok(created) },
      {
        path: `/api/threads/${THREAD.id}`,
        body: ok({
          thread: { ...THREAD, topicTitle: TOPIC.title, topicIsClosed: false },
          posts: [makePost(1)],
        }),
      },
    ])
    const user = userEvent.setup()
    const { router } = renderRoute('/t/seiyu')
    expect(await screen.findByText('まだ投稿がありません。最初の声を届けよう')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /声でスレッドを立てる/ }))
    const dialog = screen.getByRole('dialog', { name: '新しいスレッド' })
    await user.type(within(dialog).getByLabelText('タイトル'), '初投稿')
    await user.click(within(dialog).getByRole('button', { name: '録音' }))
    await user.click(await within(dialog).findByRole('button', { name: '停止' }))
    await user.click(await within(dialog).findByRole('button', { name: '投稿する' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/threads/${THREAD.id}`))
    const post = api.calls.find((c) => c.init.method === 'POST')!
    const form = post.init.body as FormData
    expect(form.get('title')).toBe('初投稿')
    expect(form.get('audio')).toBeInstanceOf(Blob)
    expect(form.get('durationMs')).toBe('1234')
    expect(JSON.parse(localStorage.getItem('tv.deleteTokens')!)).toEqual({
      [makePost(1).id]: 'd'.repeat(43),
    })
  })

  it('keeps the sheet open with a message when the upload could not be processed', async () => {
    installFakeApi([
      TOPICS,
      { path: '/api/topics/seiyu/threads', body: ok([], { nextCursor: null }) },
      {
        method: 'POST',
        path: '/api/topics/seiyu/threads',
        status: 201,
        body: ok({ thread: THREAD, post: null, deleteToken: 'd'.repeat(43) }),
      },
    ])
    const user = userEvent.setup()
    renderRoute('/t/seiyu')
    await user.click(await screen.findByRole('button', { name: /声でスレッドを立てる/ }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('タイトル'), 'x')
    await user.click(within(dialog).getByRole('button', { name: '録音' }))
    await user.click(await within(dialog).findByRole('button', { name: '停止' }))
    await user.click(await within(dialog).findByRole('button', { name: '投稿する' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('音声を処理できませんでした')
  })

  it('hides the post button for closed topics and handles unknown slugs', async () => {
    installFakeApi([
      { path: '/api/topics', body: ok([{ ...TOPIC, isClosed: true }]) },
      { path: '/api/topics/seiyu/threads', body: ok([], { nextCursor: null }) },
    ])
    renderRoute('/t/seiyu')
    expect(await screen.findByText('この話題は受付を終了しました')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /スレッドを立てる/ })).not.toBeInTheDocument()
  })

  it('shows not found for an unknown topic', async () => {
    installFakeApi([
      TOPICS,
      {
        path: '/api/topics/nope/threads',
        status: 404,
        body: fail('not_found', 'トピックが見つかりません'),
      },
    ])
    renderRoute('/t/nope')
    expect(await screen.findByText('話題が見つかりません')).toBeInTheDocument()
  })
})

describe('ThreadPage', () => {
  const detail = {
    thread: { ...THREAD, topicTitle: TOPIC.title, topicIsClosed: false },
    posts: [
      makePost(1),
      makePost(2, {
        parentPostId: makePost(1).id,
        parentSeq: 1,
        status: 'processing',
        audioUrl: null,
      }),
    ],
  }

  it('plays from the tapped post and toggles pause', async () => {
    installFakeApi([{ path: `/api/threads/${THREAD.id}`, body: ok(detail) }])
    const user = userEvent.setup()
    renderRoute(`/threads/${THREAD.id}`)
    await user.click(await screen.findByRole('button', { name: '#1 を再生' }))
    expect(await screen.findByRole('region', { name: '再生中' })).toHaveTextContent('#1 たろう')
    expect(screen.getByRole('button', { name: '#2 を再生' })).toBeDisabled()
    expect(screen.getByText('変換中…')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '#1 を一時停止' }))
    await user.click(screen.getByRole('button', { name: '>>1' }))
  })

  it('replies to a specific post with parentPostId', async () => {
    const api = installFakeApi([
      { path: `/api/threads/${THREAD.id}`, body: ok(detail) },
      {
        method: 'POST',
        path: `/api/threads/${THREAD.id}/posts`,
        status: 201,
        body: ok({ post: makePost(3), deleteToken: 'e'.repeat(43) }),
      },
    ])
    const user = userEvent.setup()
    renderRoute(`/threads/${THREAD.id}`)
    const rows = await screen.findAllByRole('button', { name: '返事する' })
    await user.click(rows[0]!)
    const dialog = screen.getByRole('dialog', { name: '#1 に返事' })
    await user.click(within(dialog).getByRole('button', { name: '録音' }))
    await user.click(await within(dialog).findByRole('button', { name: '停止' }))
    await user.click(await within(dialog).findByRole('button', { name: '投稿する' }))
    expect(await screen.findByRole('status')).toHaveTextContent('投稿しました #3')
    const form = api.calls.find((c) => c.init.method === 'POST')!.init.body as FormData
    expect(form.get('parentPostId')).toBe(makePost(1).id)
    expect(form.get('title')).toBeNull()
  })

  it('opens a general reply from the bottom button', async () => {
    installFakeApi([{ path: `/api/threads/${THREAD.id}`, body: ok(detail) }])
    const user = userEvent.setup()
    renderRoute(`/threads/${THREAD.id}`)
    await user.click(await screen.findByRole('button', { name: /声で返事する/ }))
    expect(screen.getByRole('dialog', { name: '返事を録音' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps reloading until a converting post becomes playable', async () => {
    const processing = makePost(1, { status: 'processing', audioUrl: null })
    let ready = false
    const api = installFakeApi([
      {
        path: `/api/threads/${THREAD.id}`,
        body: () =>
          ok({
            thread: { ...THREAD, topicTitle: TOPIC.title, topicIsClosed: false },
            posts: [ready ? makePost(1) : processing],
          }),
      },
    ])
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      renderRoute(`/threads/${THREAD.id}`)
      await vi.waitFor(() => expect(screen.getByText('変換中…')).toBeInTheDocument())
      ready = true
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000)
      })
      await vi.waitFor(() =>
        expect(screen.getByRole('button', { name: '#1 を再生' })).toBeEnabled(),
      )
      expect(api.calls.filter((c) => c.url.includes('/api/threads/'))).toHaveLength(2)
      // 変換が終わったらポーリングを止める
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })
      expect(api.calls.filter((c) => c.url.includes('/api/threads/'))).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops polling after the limit', async () => {
    const api = installFakeApi([
      {
        path: `/api/threads/${THREAD.id}`,
        body: ok({
          thread: { ...THREAD, topicTitle: TOPIC.title, topicIsClosed: false },
          posts: [makePost(1, { status: 'processing', audioUrl: null })],
        }),
      },
    ])
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      renderRoute(`/threads/${THREAD.id}`)
      await vi.waitFor(() => expect(screen.getByText('変換中…')).toBeInTheDocument())
      for (let i = 0; i < 25; i += 1) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(3_000)
        })
      }
      expect(api.calls.filter((c) => c.url.includes('/api/threads/')).length).toBeLessThanOrEqual(
        21,
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows an error for a missing thread', async () => {
    installFakeApi([
      {
        path: `/api/threads/${THREAD.id}`,
        status: 404,
        body: fail('not_found', 'スレッドが見つかりません'),
      },
    ])
    renderRoute(`/threads/${THREAD.id}`)
    expect(await screen.findByText('スレッドが見つかりません')).toBeInTheDocument()
  })
})

describe('ThreadPage actions', () => {
  const mine = makePost(1)
  const detail = {
    thread: { ...THREAD, topicTitle: TOPIC.title, topicIsClosed: false },
    posts: [mine, makePost(2)],
  }

  it('lets the owner delete a post after confirming', async () => {
    localStorage.setItem('tv.deleteTokens', JSON.stringify({ [mine.id]: 't'.repeat(43) }))
    const api = installFakeApi([
      { path: `/api/threads/${THREAD.id}`, body: ok(detail) },
      { method: 'DELETE', path: `/api/posts/${mine.id}`, body: ok({ id: mine.id, deleted: true }) },
    ])
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    const user = userEvent.setup()
    renderRoute(`/threads/${THREAD.id}`)
    const del = await screen.findByRole('button', { name: '#1 を削除' })
    expect(screen.queryByRole('button', { name: '#2 を削除' })).not.toBeInTheDocument()
    await user.click(del)
    expect(api.calls.some((c) => c.init.method === 'DELETE')).toBe(false)
    await user.click(del)
    expect(await screen.findByText('#1 を削除しました')).toBeInTheDocument()
    const call = api.calls.find((c) => c.init.method === 'DELETE')!
    expect((call.init.headers as Record<string, string>)['x-delete-token']).toBe('t'.repeat(43))
    expect(localStorage.getItem('tv.deleteTokens')).toBe('{}')
    confirm.mockRestore()
  })

  it('shows delete errors', async () => {
    localStorage.setItem('tv.deleteTokens', JSON.stringify({ [mine.id]: 't'.repeat(43) }))
    installFakeApi([
      { path: `/api/threads/${THREAD.id}`, body: ok(detail) },
      {
        method: 'DELETE',
        path: `/api/posts/${mine.id}`,
        status: 403,
        body: fail('forbidden', '削除する権限がありません'),
      },
    ])
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    renderRoute(`/threads/${THREAD.id}`)
    await user.click(await screen.findByRole('button', { name: '#1 を削除' }))
    expect(await screen.findByText('削除する権限がありません')).toBeInTheDocument()
    vi.restoreAllMocks()
  })

  it('copies share links for posts and threads', async () => {
    installFakeApi([{ path: `/api/threads/${THREAD.id}`, body: ok(detail) }])
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderRoute(`/threads/${THREAD.id}`)
    await user.click(await screen.findByRole('button', { name: '#2 を共有' }))
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/s/p/${makePost(2).id}`)
    expect(await screen.findByText('リンクをコピーしました')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'スレッドを共有' }))
    expect(writeText).toHaveBeenLastCalledWith(`${location.origin}/s/t/${THREAD.id}`)
  })

  it('reports another post with a reason', async () => {
    const api = installFakeApi([
      { path: `/api/threads/${THREAD.id}`, body: ok(detail) },
      {
        method: 'POST',
        path: `/api/posts/${makePost(2).id}/reports`,
        status: 201,
        body: ok({ postId: makePost(2).id, reported: true }),
      },
    ])
    const user = userEvent.setup()
    renderRoute(`/threads/${THREAD.id}`)
    await user.click(await screen.findByRole('button', { name: '#2 を通報' }))
    const dialog = screen.getByRole('dialog', { name: '#2 を通報' })
    const submit = within(dialog).getByRole('button', { name: '通報する' })
    expect(submit).toBeDisabled()
    await user.click(within(dialog).getByLabelText('個人情報'))
    await user.click(submit)
    expect(await screen.findByText('通報しました。ご協力ありがとうございます')).toBeInTheDocument()
    const call = api.calls.find((c) => c.init.method === 'POST')!
    expect(JSON.parse(call.init.body as string)).toEqual({ reason: 'privacy' })
  })

  it('keeps the report sheet open on errors and closes on demand', async () => {
    installFakeApi([
      { path: `/api/threads/${THREAD.id}`, body: ok(detail) },
      {
        method: 'POST',
        path: `/api/posts/${makePost(2).id}/reports`,
        status: 409,
        body: fail('conflict', 'すでに通報済みです'),
      },
    ])
    const user = userEvent.setup()
    renderRoute(`/threads/${THREAD.id}`)
    await user.click(await screen.findByRole('button', { name: '#2 を通報' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByLabelText('その他'))
    await user.click(within(dialog).getByRole('button', { name: '通報する' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('すでに通報済みです')
    await user.click(within(dialog).getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the link text when sharing is impossible', async () => {
    installFakeApi([{ path: `/api/threads/${THREAD.id}`, body: ok(detail) }])
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('x')) },
      configurable: true,
    })
    renderRoute(`/threads/${THREAD.id}`)
    await user.click(await screen.findByRole('button', { name: 'スレッドを共有' }))
    expect(
      await screen.findByText(`リンク: ${location.origin}/s/t/${THREAD.id}`),
    ).toBeInTheDocument()
  })
})

describe('PostRedirectPage', () => {
  it('redirects to the thread anchor and scrolls to it', async () => {
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
    const post = makePost(2)
    installFakeApi([
      { path: `/api/posts/${post.id}`, body: ok(post) },
      {
        path: `/api/threads/${THREAD.id}`,
        body: ok({ thread: { ...THREAD, topicTitle: 't', topicIsClosed: true }, posts: [post] }),
      },
    ])
    const { router } = renderRoute(`/posts/${post.id}`)
    await waitFor(() => expect(router.state.location.pathname).toBe(`/threads/${THREAD.id}`))
    expect(router.state.location.hash).toBe('#p2')
    await waitFor(() => expect(scrolled).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /声で返事する/ })).not.toBeInTheDocument()
  })

  it('shows errors', async () => {
    installFakeApi([
      { path: /\/api\/posts\//, status: 404, body: fail('not_found', '投稿が見つかりません') },
    ])
    renderRoute('/posts/x')
    expect(await screen.findByText('投稿が見つかりません')).toBeInTheDocument()
  })
})

describe('static pages', () => {
  it('renders terms and not found', async () => {
    installFakeApi([])
    renderRoute('/terms')
    expect(screen.getByRole('heading', { name: '投稿について' })).toBeInTheDocument()
  })

  it('renders 404 for unknown paths', () => {
    installFakeApi([])
    renderRoute('/nowhere')
    expect(screen.getByRole('heading', { name: 'ページがありません' })).toBeInTheDocument()
  })
})
