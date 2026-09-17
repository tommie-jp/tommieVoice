import { act, renderHook, waitFor } from '@testing-library/react'
import { useAsync } from './useAsync'

describe('useAsync', () => {
  it('loads data and reloads on demand', async () => {
    let n = 0
    const { result } = renderHook(() => useAsync(async () => ++n, []))
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', data: 1 }))
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.data).toBe(2))
  })

  it('reports errors as messages', async () => {
    const { result } = renderHook(() => useAsync(() => Promise.reject(new Error('だめ')), []))
    await waitFor(() => expect(result.current).toMatchObject({ status: 'error', error: 'だめ' }))
  })

  it('ignores results after unmount', async () => {
    let resolve!: (v: number) => void
    const { result, unmount } = renderHook(() =>
      useAsync(() => new Promise<number>((r) => (resolve = r)), []),
    )
    unmount()
    resolve(5)
    await Promise.resolve()
    expect(result.current.status).toBe('loading')
  })
})
