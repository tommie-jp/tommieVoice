import { describe, expect, it, vi } from 'vitest'
import { createSseHub, formatSse } from './sseHub.ts'

describe('sseHub', () => {
  it('delivers event to all subscribers of the streamer only', () => {
    const hub = createSseHub()
    const a1 = vi.fn()
    const a2 = vi.fn()
    const b = vi.fn()
    hub.subscribe('a', a1)
    hub.subscribe('a', a2)
    hub.subscribe('b', b)
    expect(hub.publish('a', { type: 'stop' })).toBe(2)
    expect(a1).toHaveBeenCalledWith({ type: 'stop' })
    expect(a2).toHaveBeenCalled()
    expect(b).not.toHaveBeenCalled()
    expect(hub.publish('nobody', { type: 'stop' })).toBe(0)
  })

  it('removes subscriber on close and drops failing subscribers', () => {
    const hub = createSseHub()
    const unsubscribe = hub.subscribe('a', vi.fn())
    hub.subscribe('a', () => {
      throw new Error('socket closed')
    })
    expect(hub.count('a')).toBe(2)
    expect(hub.publish('a', { type: 'stop' })).toBe(1)
    unsubscribe()
    expect(hub.count('a')).toBe(0)
  })

  it('formats server-sent events', () => {
    expect(formatSse({ type: 'stop' })).toBe('event: stop\ndata: {"type":"stop"}\n\n')
  })
})
