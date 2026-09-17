import type { OverlayEvent } from '../../../../shared/schemas/overlay.ts'

export type Subscriber = (event: OverlayEvent) => void

export type SseHub = {
  subscribe(streamerId: string, subscriber: Subscriber): () => void
  publish(streamerId: string, event: OverlayEvent): number
  count(streamerId: string): number
}

/** 配信者ごとのオーバーレイ接続（単一プロセス前提） */
export function createSseHub(): SseHub {
  const channels = new Map<string, Set<Subscriber>>()
  return {
    subscribe(streamerId, subscriber) {
      const set = channels.get(streamerId) ?? new Set<Subscriber>()
      set.add(subscriber)
      channels.set(streamerId, set)
      return () => {
        set.delete(subscriber)
        if (set.size === 0) channels.delete(streamerId)
      }
    },
    publish(streamerId, event) {
      const set = channels.get(streamerId)
      if (!set) return 0
      for (const subscriber of [...set]) {
        try {
          subscriber(event)
        } catch {
          set.delete(subscriber)
        }
      }
      return set.size
    },
    count(streamerId) {
      return channels.get(streamerId)?.size ?? 0
    },
  }
}

export function formatSse(event: OverlayEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
}
