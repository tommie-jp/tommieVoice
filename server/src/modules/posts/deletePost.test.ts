import { existsSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTopic, postReply, postThread } from '../../../test/helpers/api.ts'
import { truncateAll } from '../../../test/helpers/db.ts'
import { createTestContext, type TestContext } from '../../../test/helpers/testApp.ts'
import { RELAXED_RATE_LIMITS } from '../../../../shared/constants.ts'

describe('DELETE /api/posts/:id', () => {
  let ctx: TestContext
  beforeAll(async () => {
    ctx = await createTestContext({ limits: RELAXED_RATE_LIMITS })
  })
  afterAll(async () => {
    await ctx.close()
  })
  beforeEach(async () => {
    await truncateAll(ctx.handle.pool)
  })

  const del = (id: string, token?: string) =>
    ctx.app.inject({
      method: 'DELETE',
      url: `/api/posts/${id}`,
      headers: token === undefined ? {} : { 'x-delete-token': token },
    })

  it('deletes with valid token and removes files', async () => {
    const { slug } = await createTopic(ctx.app)
    const { post, deleteToken } = (await postThread(ctx.app, slug)).json().data
    const rows = await ctx.handle.pool.query('SELECT original_path, public_path FROM posts')
    const { original_path, public_path } = rows.rows[0]
    const res = await del(post.id, deleteToken)
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toEqual({ id: post.id, deleted: true })
    expect(existsSync(`${ctx.audioDir}/original/${original_path}`)).toBe(false)
    expect(existsSync(`${ctx.audioDir}/public/${public_path}`)).toBe(false)
    expect((await del(post.id, deleteToken)).statusCode).toBe(404)
  })

  it('rejects wrong or missing token with 403', async () => {
    const { slug } = await createTopic(ctx.app)
    const { post, deleteToken } = (await postThread(ctx.app, slug)).json().data
    expect((await del(post.id, `${deleteToken.slice(0, -1)}x`)).statusCode).toBe(403)
    expect((await del(post.id)).statusCode).toBe(403)
    expect((await del(post.id, 'short')).statusCode).toBe(403)
    expect((await ctx.app.inject({ method: 'GET', url: `/api/posts/${post.id}` })).statusCode).toBe(
      200,
    )
  })

  it('deleted post disappears from thread but seq gap remains', async () => {
    const { slug } = await createTopic(ctx.app)
    const first = (await postThread(ctx.app, slug)).json().data
    const second = (await postReply(ctx.app, first.thread.id)).json().data
    await del(second.post.id, second.deleteToken)
    const third = (await postReply(ctx.app, first.thread.id)).json().data
    expect(third.post.seq).toBe(3)
    const detail = (
      await ctx.app.inject({ method: 'GET', url: `/api/threads/${first.thread.id}` })
    ).json().data
    expect(detail.posts.map((p: { seq: number }) => p.seq)).toEqual([1, 3])
    expect(detail.thread.postCount).toBe(2)
  })

  it('404s for unknown posts', async () => {
    expect((await del('0b3c9a34-6f0e-4f3b-9d8a-1f2e3d4c5b6a', 'x'.repeat(43))).statusCode).toBe(404)
  })
})

describe('POST /api/posts/mine', () => {
  it('returns only posts whose token matches, including pending inbox posts', async () => {
    const { createInbox, createStreamer } = await import('../../../test/helpers/api.ts')
    const ctx = await createTestContext({ limits: RELAXED_RATE_LIMITS })
    try {
      await truncateAll(ctx.handle.pool)
      const { streamer } = await createStreamer(ctx.app)
      const inbox = await createInbox(ctx.app, streamer.id)
      const board = await createTopic(ctx.app)
      const a = (await postThread(ctx.app, inbox.slug)).json().data
      const b = (await postThread(ctx.app, board.slug)).json().data
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/posts/mine',
        payload: {
          items: [
            { id: a.post.id, token: a.deleteToken },
            { id: b.post.id, token: 'x'.repeat(43) },
            { id: '0b3c9a34-6f0e-4f3b-9d8a-1f2e3d4c5b6a', token: 'y'.repeat(43) },
          ],
        },
      })
      expect(res.json().data).toEqual([
        expect.objectContaining({ id: a.post.id, reviewStatus: 'pending' }),
      ])
      const tooMany = Array.from({ length: 51 }, () => ({ id: a.post.id, token: a.deleteToken }))
      expect(
        (
          await ctx.app.inject({
            method: 'POST',
            url: '/api/posts/mine',
            payload: { items: tooMany },
          })
        ).statusCode,
      ).toBe(400)
    } finally {
      await ctx.close()
    }
  })
})
