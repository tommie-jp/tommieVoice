import { act, renderHook } from '@testing-library/react'
import { fakeRecorder } from '../../test/fakeRecorder'
import { useRecorder } from './useRecorder'

describe('useRecorder', () => {
  afterEach(() => vi.useRealTimers())

  it('records, previews and resets', async () => {
    const rec = fakeRecorder()
    const { result } = renderHook(() => useRecorder(() => rec))
    await act(() => result.current.start())
    expect(result.current.status).toBe('recording')
    await act(() => result.current.stop())
    expect(result.current.status).toBe('recorded')
    expect(result.current.recorded).toMatchObject({
      durationMs: 1234,
      mimeType: 'audio/webm;codecs=opus',
    })
    act(() => result.current.reset())
    expect(result.current).toMatchObject({ status: 'idle', recorded: null, elapsedMs: 0 })
  })

  it('auto-stops at maxDurationMs', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    const rec = fakeRecorder({ durationMs: 5_500 })
    const { result } = renderHook(() => useRecorder(() => rec, 5_000))
    await act(() => result.current.start())
    await act(async () => {
      vi.advanceTimersByTime(5_200)
    })
    expect(result.current.status).toBe('recorded')
    expect(result.current.recorded?.durationMs).toBe(5_000)
  })

  it('surfaces start errors', async () => {
    const rec = fakeRecorder({ failStart: new Error('マイクの利用が許可されていません') })
    const { result } = renderHook(() => useRecorder(() => rec))
    await act(() => result.current.start())
    expect(result.current).toMatchObject({
      status: 'idle',
      error: 'マイクの利用が許可されていません',
    })
  })

  it('surfaces stop errors', async () => {
    const rec = fakeRecorder({ failStop: new Error('停止失敗') })
    const { result } = renderHook(() => useRecorder(() => rec))
    await act(() => result.current.start())
    await act(() => result.current.stop())
    expect(result.current).toMatchObject({ status: 'idle', error: '停止失敗' })
  })

  it('cancels the recorder on unmount', () => {
    const rec = fakeRecorder()
    const { unmount } = renderHook(() => useRecorder(() => rec))
    unmount()
    expect(rec.cancelled).toBe(1)
  })
})
