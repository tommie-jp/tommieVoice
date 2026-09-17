import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fail, installFakeApi, ok } from '../../test/fakeApi'
import { OverlayPanel } from './OverlayPanel'

describe('OverlayPanel', () => {
  it('issues a URL once and shows OBS instructions', async () => {
    installFakeApi([
      { path: '/api/streamer/overlay-token', body: ok({ issued: false, connections: 0 }) },
      {
        method: 'POST',
        path: '/api/streamer/overlay-token',
        body: ok({ token: 'T'.repeat(43), path: `/overlay/${'T'.repeat(43)}` }),
      },
    ])
    const user = userEvent.setup()
    render(<OverlayPanel onChanged={vi.fn()} />)
    expect(await screen.findByText('未接続')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'URL を発行' }))
    expect(
      await screen.findByText(`${location.origin}/overlay/${'T'.repeat(43)}`),
    ).toBeInTheDocument()
    expect(screen.getByText(/OBS で音声を制御する/)).toBeInTheDocument()
  })

  it('asks before reissuing and shows connection count', async () => {
    const api = installFakeApi([
      { path: '/api/streamer/overlay-token', body: ok({ issued: true, connections: 2 }) },
      {
        method: 'POST',
        path: '/api/streamer/overlay-token',
        body: ok({ token: 'x'.repeat(43), path: '/overlay/x' }),
      },
    ])
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    render(<OverlayPanel onChanged={vi.fn()} />)
    expect(await screen.findByText('接続中 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'URL を作り直す' }))
    expect(api.calls.some((c) => c.init.method === 'POST')).toBe(false)
    confirm.mockRestore()
  })

  it('plays next and stops through the control API', async () => {
    const onChanged = vi.fn()
    const api = installFakeApi([
      { path: '/api/streamer/overlay-token', body: ok({ issued: true, connections: 1 }) },
      {
        method: 'POST',
        path: '/api/streamer/overlay/control',
        body: ({ init }: { init: RequestInit }) =>
          JSON.parse(init.body as string).action === 'next'
            ? ok({ delivered: 1, postId: 'p1' })
            : ok({ delivered: 1, postId: null }),
      },
    ])
    const user = userEvent.setup()
    render(<OverlayPanel onChanged={onChanged} />)
    await user.click(await screen.findByRole('button', { name: '次を流す' }))
    expect(await screen.findByText('次の声を流しました')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '停止' }))
    expect(await screen.findByText('停止しました')).toBeInTheDocument()
    expect(onChanged).toHaveBeenCalledTimes(2)
    const bodies = api.calls
      .filter((c) => c.init.method === 'POST')
      .map((c) => JSON.parse(c.init.body as string))
    expect(bodies).toEqual([{ action: 'next' }, { action: 'stop' }])
  })

  it('explains undelivered plays and errors', async () => {
    installFakeApi([
      { path: '/api/streamer/overlay-token', body: ok({ issued: true, connections: 0 }) },
      {
        method: 'POST',
        path: '/api/streamer/overlay/control',
        body: ok({ delivered: 0, postId: 'p1' }),
      },
    ])
    const user = userEvent.setup()
    const { unmount } = render(<OverlayPanel onChanged={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: '次を流す' }))
    expect(await screen.findByText(/オーバーレイ未接続/)).toBeInTheDocument()
    unmount()

    installFakeApi([
      { path: '/api/streamer/overlay-token', body: ok({ issued: true, connections: 0 }) },
      {
        method: 'POST',
        path: '/api/streamer/overlay/control',
        status: 404,
        body: fail('not_found', '採用済みの声がありません'),
      },
    ])
    render(<OverlayPanel onChanged={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: '次を流す' }))
    await waitFor(() => expect(screen.getByText('採用済みの声がありません')).toBeInTheDocument())
  })
})
