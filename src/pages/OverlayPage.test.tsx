import { act, fireEvent, screen } from '@testing-library/react'
import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { OverlayPage, type EventSourceFactory } from './OverlayPage'

class FakeEventSource {
  static last: FakeEventSource | null = null
  url: string
  closed = false
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  private listeners = new Map<string, ((e: MessageEvent<string>) => void)[]>()
  constructor(url: string) {
    this.url = url
    FakeEventSource.last = this
  }
  addEventListener(type: string, fn: (e: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn])
  }
  emit(type: string, data: unknown) {
    for (const fn of this.listeners.get(type) ?? [])
      fn({ data: JSON.stringify(data) } as MessageEvent<string>)
  }
  close() {
    this.closed = true
  }
}

const factory: EventSourceFactory = (url) => new FakeEventSource(url) as unknown as EventSource

function renderOverlay(path = '/overlay/tok123') {
  const router = createMemoryRouter(
    [{ path: '/overlay/:token', element: <OverlayPage createSource={factory} /> }],
    {
      initialEntries: [path],
    },
  )
  return render(<RouterProvider router={router} />)
}

const POST = {
  id: 'p1',
  audioUrl: '/audio/public/2026/09/p1.m4a',
  authorName: 'ゆき',
  title: '質問です',
  threadTitle: 't',
  segments: [
    { start: 0, end: 1, text: 'こんにちは' },
    { start: 2, end: 3, text: 'よろしく' },
  ],
}

describe('OverlayPage', () => {
  it('connects to the token stream and makes the page transparent', () => {
    const { unmount } = renderOverlay()
    const source = FakeEventSource.last!
    expect(source.url).toBe('/api/overlay/tok123/events')
    expect(document.documentElement).toHaveClass('overlay-mode')
    expect(screen.getByText('接続中…')).toBeInTheDocument()
    act(() => {
      source.onopen?.()
      source.emit('hello', { type: 'hello', streamerName: 'とみー' })
    })
    expect(screen.getByText('● とみー')).toBeInTheDocument()
    unmount()
    expect(source.closed).toBe(true)
    expect(document.documentElement).not.toHaveClass('overlay-mode')
  })

  it('plays audio and shows author and synced subtitles on play event', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play')
    renderOverlay()
    const source = FakeEventSource.last!
    act(() => source.emit('play', { type: 'play', post: POST }))
    expect(screen.getByRole('status')).toHaveTextContent('🎙 ゆき 「質問です」')
    const audio = screen.getByLabelText('オーバーレイ音声') as HTMLAudioElement
    expect(audio.src).toContain('/audio/public/2026/09/p1.m4a')
    expect(play).toHaveBeenCalled()
    Object.defineProperty(audio, 'currentTime', { value: 0.5, configurable: true })
    fireEvent.timeUpdate(audio)
    expect(screen.getByText('こんにちは')).toBeInTheDocument()
    Object.defineProperty(audio, 'currentTime', { value: 1.5, configurable: true })
    fireEvent.timeUpdate(audio)
    expect(screen.queryByText('こんにちは')).not.toBeInTheDocument()
    fireEvent.ended(audio)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    play.mockRestore()
  })

  it('clears on stop event and ignores malformed events', () => {
    renderOverlay()
    const source = FakeEventSource.last!
    act(() => source.emit('play', { type: 'play', post: POST }))
    act(() => source.emit('play', { type: 'play', post: { nope: true } }))
    expect(screen.getByRole('status')).toBeInTheDocument()
    act(() => source.emit('stop', { type: 'stop' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows reconnecting after error, respects size and quiet options', () => {
    const { container, unmount } = renderOverlay('/overlay/tok?size=500')
    act(() => FakeEventSource.last!.onerror?.())
    expect(screen.getByText('再接続中…')).toBeInTheDocument()
    expect((container.querySelector('.overlay') as HTMLElement).style.fontSize).toBe('96px')
    unmount()
    renderOverlay('/overlay/tok?quiet')
    expect(screen.queryByText('接続中…')).not.toBeInTheDocument()
  })

  it('reports playback failures as an error state', async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockRejectedValue(new Error('autoplay'))
    renderOverlay()
    await act(async () => FakeEventSource.last!.emit('play', { type: 'play', post: POST }))
    expect(screen.getByText('再接続中…')).toBeInTheDocument()
    play.mockRestore()
  })
})
