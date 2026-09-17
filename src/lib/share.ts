export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed'

/** Web Share API を使い、無ければクリップボードへコピーする */
export async function shareLink(url: string, title: string): Promise<ShareResult> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ url, title })
      return 'shared'
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return 'cancelled'
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    return 'failed'
  }
}

export function sharePostUrl(postId: string): string {
  return `${window.location.origin}/s/p/${postId}`
}

export function shareThreadUrl(threadId: string): string {
  return `${window.location.origin}/s/t/${threadId}`
}
