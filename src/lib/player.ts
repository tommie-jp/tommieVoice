// 1 つの <audio> 要素を使い回すプレイヤー。
// iOS Safari はユーザー操作で再生を始めた要素なら、ended 後の次曲再生も許可する。

export type PlayerItem = { readonly id: string; readonly url: string; readonly label: string }

export type PlayerState = {
  readonly queue: readonly PlayerItem[]
  readonly index: number
  readonly playing: boolean
  readonly loading: boolean
  readonly currentTime: number
  readonly duration: number
  readonly rate: number
  readonly error: string | null
}

export type Player = {
  getState(): PlayerState
  subscribe(listener: () => void): () => void
  playQueue(items: readonly PlayerItem[], startIndex: number): void
  toggle(): void
  seek(seconds: number): void
  setRate(rate: number): void
  next(): void
  stop(): void
  readonly element: HTMLAudioElement
}

export const PLAYBACK_RATES = [1, 1.25, 1.5, 2] as const

export const INITIAL_STATE: PlayerState = {
  queue: [],
  index: -1,
  playing: false,
  loading: false,
  currentTime: 0,
  duration: 0,
  rate: 1,
  error: null,
}

export function currentItem(state: PlayerState): PlayerItem | null {
  return state.queue[state.index] ?? null
}

export function createPlayer(element: HTMLAudioElement = new Audio()): Player {
  let state = INITIAL_STATE
  const listeners = new Set<() => void>()
  element.preload = 'auto'

  const set = (patch: Partial<PlayerState>) => {
    state = { ...state, ...patch }
    listeners.forEach((l) => l())
  }

  const load = (index: number) => {
    const item = state.queue[index]
    if (!item) {
      element.pause()
      set({ index: -1, playing: false, loading: false, currentTime: 0, duration: 0 })
      return
    }
    element.src = item.url
    // WebKit は src 変更で playbackRate を戻すので default も合わせる
    element.defaultPlaybackRate = state.rate
    element.playbackRate = state.rate
    set({ index, loading: true, currentTime: 0, duration: 0, error: null })
    const started = element.play()
    if (started && typeof started.catch === 'function') {
      started.catch((err: unknown) => {
        const name = (err as { name?: unknown } | null)?.name
        if (name === 'AbortError') return
        set({
          playing: false,
          loading: false,
          error: '再生できませんでした。もう一度タップしてください',
        })
      })
    }
  }

  element.addEventListener('playing', () => set({ playing: true, loading: false }))
  element.addEventListener('pause', () => set({ playing: false }))
  element.addEventListener('waiting', () => set({ loading: true }))
  element.addEventListener('timeupdate', () => set({ currentTime: element.currentTime }))
  element.addEventListener('durationchange', () =>
    set({ duration: Number.isFinite(element.duration) ? element.duration : 0 }),
  )
  element.addEventListener('ended', () => load(state.index + 1))
  element.addEventListener('error', () =>
    set({ playing: false, loading: false, error: 'この音声を再生できませんでした' }),
  )

  return {
    element,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    playQueue(items, startIndex) {
      set({ queue: [...items] })
      load(startIndex)
    },
    toggle() {
      if (state.index < 0) return
      if (element.paused) {
        void element.play()?.catch(() => set({ error: '再生できませんでした' }))
      } else {
        element.pause()
      }
    },
    seek(seconds) {
      if (state.index < 0) return
      const max = state.duration > 0 ? state.duration : seconds
      element.currentTime = Math.min(Math.max(0, seconds), max)
      set({ currentTime: element.currentTime })
    },
    setRate(rate) {
      element.defaultPlaybackRate = rate
      element.playbackRate = rate
      set({ rate })
    },
    next() {
      load(state.index + 1)
    },
    stop() {
      element.pause()
      element.removeAttribute('src')
      set({ ...INITIAL_STATE, rate: state.rate })
    },
  }
}
