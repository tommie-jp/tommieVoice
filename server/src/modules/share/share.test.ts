import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { RELAXED_RATE_LIMITS } from '../../../../shared/constants.ts'
import { createTopic, postThread } from '../../../test/helpers/api.ts'
import { truncateAll } from '../../../test/helpers/db.ts'
import { createTestContext, type TestContext } from '../../../test/helpers/testApp.ts'
import { escapeHtml, renderSharePage, truncate } from './html.ts'

describe('share html helpers', () => {
  it('escapes title containing script tag', () => {
    const html = renderSharePage({
      title: '<script>alert("x")</script>',
      description: "it's",
      path: '/threads/1',
      origin: 'https://voice.example',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;')
    expect(html).toContain('it&#39;s')
    expect(escapeHtml('a&b')).toBe('a&amp;b')
  })

  it('refuses off-site redirect paths', () => {
    expect(() =>
      renderSharePage({ title: 't', description: 'd', path: '//evil.example', origin: 'o' }),
    ).toThrow()
    expect(() =>
      renderSharePage({ title: 't', description: 'd', path: 'https://evil', origin: 'o' }),
    ).toThrow()
  })

  it('truncates long descriptions by characters', () => {
    expect(truncate('あ'.repeat(10), 5)).toBe('ああああ…')
    expect(truncate('short', 5)).toBe('short')
  })
})

describe('share routes', () => {
  let ctx: TestContext
  beforeAll(async () => {
    ctx = await createTestContext({
      limits: RELAXED_RATE_LIMITS,
      env: { PUBLIC_ORIGIN: 'https://voice.example' },
    })
  })
  afterAll(async () => {
    await ctx.close()
  })
  beforeEach(async () => {
    await truncateAll(ctx.handle.pool)
  })

  it('renders og tags for ready post', async () => {
    const { slug } = await createTopic(ctx.app, { title: '声劇' })
    const { post } = (
      await postThread(ctx.app, slug, { fields: { authorName: 'ゆき', title: '名台詞' } })
    ).json().data
    const res = await ctx.app.inject({ method: 'GET', url: `/s/p/${post.id}` })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.body).toContain('<meta property="og:title" content="名台詞 | tommieVoice">')
    expect(res.body).toContain('ゆき の声 ・ 声劇')
    expect(res.body).toContain(`https://voice.example${post.audioUrl}`)
    expect(res.body).toContain(`url=/posts/${post.id}`)
  })

  it('renders thread share pages', async () => {
    const { slug } = await createTopic(ctx.app, { title: '雑談' })
    const { thread } = (await postThread(ctx.app, slug)).json().data
    const res = await ctx.app.inject({ method: 'GET', url: `/s/t/${thread.id}` })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('雑談 ・ 1 件の声')
  })

  it('returns 404 html for hidden post and unknown ids', async () => {
    const { slug } = await createTopic(ctx.app)
    const { post, thread } = (await postThread(ctx.app, slug)).json().data
    await ctx.handle.pool.query("UPDATE posts SET status = 'hidden'")
    for (const url of [
      `/s/p/${post.id}`,
      `/s/t/${thread.id}`,
      '/s/p/not-a-uuid',
      '/s/t/not-a-uuid',
    ]) {
      const res = await ctx.app.inject({ method: 'GET', url })
      expect(res.statusCode).toBe(404)
      expect(res.body).toContain('見つかりません')
    }
  })
})
