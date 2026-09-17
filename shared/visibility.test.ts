import { describe, expect, it } from 'vitest'
import { isPubliclyVisible } from './visibility.ts'

const board = { mode: 'board', publishOn: 'immediately' } as const
const inboxAired = { mode: 'inbox', publishOn: 'aired' } as const
const inboxNow = { mode: 'inbox', publishOn: 'immediately' } as const

describe('isPubliclyVisible', () => {
  it('board topic shows ready and processing posts', () => {
    expect(isPubliclyVisible(board, { status: 'ready', reviewStatus: null })).toBe(true)
    expect(isPubliclyVisible(board, { status: 'processing', reviewStatus: null })).toBe(true)
  })

  it('inbox topic with publish_on aired hides approved posts', () => {
    expect(isPubliclyVisible(inboxAired, { status: 'ready', reviewStatus: 'pending' })).toBe(false)
    expect(isPubliclyVisible(inboxAired, { status: 'ready', reviewStatus: 'approved' })).toBe(false)
    expect(isPubliclyVisible(inboxAired, { status: 'ready', reviewStatus: 'rejected' })).toBe(false)
  })

  it('inbox topic shows aired posts', () => {
    expect(isPubliclyVisible(inboxAired, { status: 'ready', reviewStatus: 'aired' })).toBe(true)
  })

  it('inbox topic can publish immediately', () => {
    expect(isPubliclyVisible(inboxNow, { status: 'ready', reviewStatus: 'pending' })).toBe(true)
  })

  it('hidden, failed and deleted are never visible', () => {
    for (const status of ['hidden', 'failed', 'deleted'] as const) {
      expect(isPubliclyVisible(board, { status, reviewStatus: null })).toBe(false)
      expect(isPubliclyVisible(inboxAired, { status, reviewStatus: 'aired' })).toBe(false)
    }
  })
})
