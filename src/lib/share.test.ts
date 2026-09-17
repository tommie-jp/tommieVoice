import { sharePostUrl, shareThreadUrl, shareLink } from './share'

function setNavigator(share: unknown, writeText: unknown) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true })
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}

describe('shareLink', () => {
  afterEach(() => setNavigator(undefined, undefined))

  it('uses the Web Share API when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    setNavigator(share, vi.fn())
    await expect(shareLink('https://x/s/p/1', 't')).resolves.toBe('shared')
    expect(share).toHaveBeenCalledWith({ url: 'https://x/s/p/1', title: 't' })
  })

  it('reports cancellation without copying', async () => {
    const writeText = vi.fn()
    setNavigator(vi.fn().mockRejectedValue(new DOMException('x', 'AbortError')), writeText)
    await expect(shareLink('u', 't')).resolves.toBe('cancelled')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('falls back to clipboard when navigator.share is missing or fails', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setNavigator(undefined, writeText)
    await expect(shareLink('u', 't')).resolves.toBe('copied')
    setNavigator(vi.fn().mockRejectedValue(new Error('nope')), writeText)
    await expect(shareLink('u', 't')).resolves.toBe('copied')
  })

  it('reports failure when nothing works', async () => {
    setNavigator(undefined, vi.fn().mockRejectedValue(new Error('denied')))
    await expect(shareLink('u', 't')).resolves.toBe('failed')
  })

  it('builds share urls on the current origin', () => {
    expect(sharePostUrl('p1')).toBe(`${location.origin}/s/p/p1`)
    expect(shareThreadUrl('t1')).toBe(`${location.origin}/s/t/t1`)
  })
})
