import { createPlayer, currentItem, type PlayerItem } from './player'

const items: PlayerItem[] = [
  { id: 'a', url: '/audio/public/a.m4a', label: '#1' },
  { id: 'b', url: '/audio/public/b.m4a', label: '#2' },
]

function fakeAudio() {
  const el = document.createElement('audio')
  const play = vi.fn(() => {
    Object.defineProperty(el, 'paused', { value: false, configurable: true })
    el.dispatchEvent(new Event('playing'))
    return Promise.resolve()
  })
  const pause = vi.fn(() => {
    Object.defineProperty(el, 'paused', { value: true, configurable: true })
    el.dispatchEvent(new Event('pause'))
  })
  el.play = play
  el.pause = pause
  return { el, play, pause }
}

describe('player', () => {
  it('plays the selected item and reports state', () => {
    const { el } = fakeAudio()
    const player = createPlayer(el)
    player.playQueue(items, 0)
    expect(el.src).toContain('/audio/public/a.m4a')
    expect(player.getState()).toMatchObject({ index: 0, playing: true, loading: false })
    expect(currentItem(player.getState())?.id).toBe('a')
  })

  it('plays next item when current ends', () => {
    const { el } = fakeAudio()
    const player = createPlayer(el)
    player.playQueue(items, 0)
    el.dispatchEvent(new Event('ended'))
    expect(el.src).toContain('/audio/public/b.m4a')
    expect(player.getState().index).toBe(1)
  })

  it('stops at end of queue', () => {
    const { el, pause } = fakeAudio()
    const player = createPlayer(el)
    player.playQueue(items, 1)
    el.dispatchEvent(new Event('ended'))
    expect(player.getState()).toMatchObject({ index: -1, playing: false })
    expect(pause).toHaveBeenCalled()
  })

  it('keeps playbackRate across items', () => {
    const { el } = fakeAudio()
    const player = createPlayer(el)
    player.setRate(1.5)
    player.playQueue(items, 0)
    player.next()
    expect(el.playbackRate).toBe(1.5)
    expect(player.getState().rate).toBe(1.5)
  })

  it('reuses the same audio element', () => {
    const { el } = fakeAudio()
    const player = createPlayer(el)
    player.playQueue(items, 0)
    player.playQueue(items, 1)
    expect(player.element).toBe(el)
  })

  it('toggles pause and resume', () => {
    const { el, play, pause } = fakeAudio()
    const player = createPlayer(el)
    player.toggle()
    expect(play).not.toHaveBeenCalled()
    player.playQueue(items, 0)
    player.toggle()
    expect(pause).toHaveBeenCalled()
    expect(player.getState().playing).toBe(false)
    player.toggle()
    expect(play).toHaveBeenCalledTimes(2)
  })

  it('clamps seek within the duration and notifies listeners', () => {
    const { el } = fakeAudio()
    const player = createPlayer(el)
    const listener = vi.fn()
    const unsubscribe = player.subscribe(listener)
    player.seek(5)
    expect(listener).not.toHaveBeenCalled()
    player.playQueue(items, 0)
    Object.defineProperty(el, 'duration', { value: 10, configurable: true })
    el.dispatchEvent(new Event('durationchange'))
    player.seek(99)
    expect(player.getState().currentTime).toBe(10)
    player.seek(-3)
    expect(player.getState().currentTime).toBe(0)
    expect(listener).toHaveBeenCalled()
    unsubscribe()
  })

  it('tracks time, waiting and errors', () => {
    const { el } = fakeAudio()
    const player = createPlayer(el)
    player.playQueue(items, 0)
    el.dispatchEvent(new Event('waiting'))
    expect(player.getState().loading).toBe(true)
    Object.defineProperty(el, 'currentTime', { value: 3, configurable: true, writable: true })
    el.dispatchEvent(new Event('timeupdate'))
    expect(player.getState().currentTime).toBe(3)
    Object.defineProperty(el, 'duration', { value: Infinity, configurable: true })
    el.dispatchEvent(new Event('durationchange'))
    expect(player.getState().duration).toBe(0)
    el.dispatchEvent(new Event('error'))
    expect(player.getState().error).toMatch(/再生できません/)
  })

  it('reports a rejected play() but ignores AbortError', async () => {
    const { el } = fakeAudio()
    el.play = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('interrupted', 'AbortError'))
      .mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'))
    const player = createPlayer(el)
    player.playQueue(items, 0)
    await Promise.resolve()
    expect(player.getState().error).toBeNull()
    player.playQueue(items, 1)
    await vi.waitFor(() => expect(player.getState().error).toMatch(/タップ/))
  })

  it('stop resets state but keeps the rate', () => {
    const { el } = fakeAudio()
    const player = createPlayer(el)
    player.setRate(2)
    player.playQueue(items, 0)
    player.stop()
    expect(player.getState()).toMatchObject({ index: -1, queue: [], rate: 2 })
    expect(el.getAttribute('src')).toBeNull()
  })
})
