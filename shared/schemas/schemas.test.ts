import { describe, expect, it } from 'vitest'
import { replyFieldsSchema, threadFieldsSchema } from './post.ts'
import { topicCreateSchema, topicUpdateSchema } from './topic.ts'

const UUID = '0b3c9a34-6f0e-4f3b-9d8a-1f2e3d4c5b6a'

describe('replyFieldsSchema', () => {
  it('rejects durationMs above 92000', () => {
    expect(replyFieldsSchema.safeParse({ durationMs: '92001' }).success).toBe(false)
  })

  it('coerces durationMs from a multipart string', () => {
    expect(replyFieldsSchema.parse({ durationMs: '1500' }).durationMs).toBe(1500)
  })

  it('defaults authorName and title to null when empty', () => {
    const parsed = replyFieldsSchema.parse({ durationMs: '1', authorName: '  ', title: '' })
    expect(parsed.authorName).toBeNull()
    expect(parsed.title).toBeNull()
  })

  it('treats an empty parentPostId as null and validates uuids', () => {
    expect(replyFieldsSchema.parse({ durationMs: '1', parentPostId: '' }).parentPostId).toBeNull()
    expect(replyFieldsSchema.parse({ durationMs: '1', parentPostId: UUID }).parentPostId).toBe(UUID)
    expect(replyFieldsSchema.safeParse({ durationMs: '1', parentPostId: 'x' }).success).toBe(false)
  })

  it('rejects author names longer than 20 characters', () => {
    expect(
      replyFieldsSchema.safeParse({ durationMs: '1', authorName: 'あ'.repeat(21) }).success,
    ).toBe(false)
  })
})

describe('threadFieldsSchema', () => {
  it('requires a non-blank title and trims it', () => {
    expect(threadFieldsSchema.safeParse({ durationMs: '1', title: '   ' }).success).toBe(false)
    expect(threadFieldsSchema.parse({ durationMs: '1', title: ' 声劇 ' }).title).toBe('声劇')
  })

  it('limits the title to 40 characters', () => {
    expect(threadFieldsSchema.safeParse({ durationMs: '1', title: 'a'.repeat(41) }).success).toBe(
      false,
    )
  })
})

describe('topic schemas', () => {
  it('accepts a lowercase slug and defaults sortOrder', () => {
    const parsed = topicCreateSchema.parse({ slug: 'seiyu-asobi', title: 'ネット声優遊び' })
    expect(parsed.sortOrder).toBe(0)
    expect(parsed.description).toBeNull()
  })

  it('rejects slugs with uppercase or leading hyphen', () => {
    expect(topicCreateSchema.safeParse({ slug: 'Bad', title: 't' }).success).toBe(false)
    expect(topicCreateSchema.safeParse({ slug: '-bad', title: 't' }).success).toBe(false)
  })

  it('rejects an empty update', () => {
    expect(topicUpdateSchema.safeParse({}).success).toBe(false)
    expect(topicUpdateSchema.parse({ isClosed: true })).toEqual({ isClosed: true })
  })
})

describe('airedRefSchema', async () => {
  const { airedRefSchema } = await import('./streamer.ts')
  it('accepts http(s) urls only', () => {
    expect(airedRefSchema.safeParse('https://www.youtube.com/watch?v=x&t=1').success).toBe(true)
    expect(airedRefSchema.safeParse('http://twitch.tv/abc').success).toBe(true)
    expect(airedRefSchema.safeParse('javascript:alert(1)').success).toBe(false)
    expect(airedRefSchema.safeParse('data:text/html,x').success).toBe(false)
    expect(airedRefSchema.safeParse('https://localhost').success).toBe(false)
  })
})
