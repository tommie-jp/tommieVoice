import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { adminHeaders, createTopic, postThread } from '../../../test/helpers/api.ts'
import { truncateAll } from '../../../test/helpers/db.ts'
import { createTestContext, type TestContext } from '../../../test/helpers/testApp.ts'

describe('topics API', () => {
  let ctx: TestContext

  beforeAll(async () => {
    ctx = await createTestContext()
  })
  afterAll(async () => {
    await ctx.close()
  })
  beforeEach(async () => {
    await truncateAll(ctx.handle.pool)
  })

  it('lists topics ordered by sort_order with thread counts', async () => {
    const b = await createTopic(ctx.app, { slug: 'bbb', title: 'B', sortOrder: 2 })
    await createTopic(ctx.app, { slug: 'aaa', title: 'A', sortOrder: 1 })
    expect((await postThread(ctx.app, b.slug)).statusCode).toBe(201)
    const res = await ctx.app.inject({ method: 'GET', url: '/api/topics' })
    expect(res.statusCode).toBe(200)
    const data = res.json().data
    expect(data.map((t: { slug: string }) => t.slug)).toEqual(['aaa', 'bbb'])
    expect(data[1].threadCount).toBe(1)
  })

  it('admin creates topic with script text', async () => {
    const topic = await createTopic(ctx.app, {
      slug: 'seiyu',
      title: 'ネット声優',
      scriptText: '「ここは任せて先に行け！」',
    })
    expect(topic).toMatchObject({
      slug: 'seiyu',
      scriptText: '「ここは任せて先に行け！」',
      isClosed: false,
    })
  })

  it('rejects duplicate slug with 409', async () => {
    await createTopic(ctx.app, { slug: 'dup' })
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/topics',
      headers: adminHeaders(),
      payload: { slug: 'dup', title: 'again' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('conflict')
  })

  it('rejects invalid body with a validation error', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/topics',
      headers: adminHeaders(),
      payload: { slug: 'NG', title: '' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('validation_error')
  })

  it('updates a topic and 404s for unknown ids', async () => {
    const topic = await createTopic(ctx.app)
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/admin/topics/${topic.id}`,
      headers: adminHeaders(),
      payload: { isClosed: true, sortOrder: 5 },
    })
    expect(res.json().data).toMatchObject({ isClosed: true, sortOrder: 5 })
    const missing = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/admin/topics/0b3c9a34-6f0e-4f3b-9d8a-1f2e3d4c5b6a',
      headers: adminHeaders(),
      payload: { isClosed: true },
    })
    expect(missing.statusCode).toBe(404)
  })

  it('closed topic rejects new threads with 403', async () => {
    const topic = await createTopic(ctx.app)
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/admin/topics/${topic.id}`,
      headers: adminHeaders(),
      payload: { isClosed: true },
    })
    const res = await postThread(ctx.app, topic.slug)
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('topic_closed')
  })
})
