import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import type { Db } from '../../db/client.ts'
import { findVisiblePost } from '../posts/repo.ts'
import { findThread } from '../threads/repo.ts'
import { renderSharePage } from './html.ts'

const idParams = z.object({ id: z.uuid() })

function sendHtml(reply: FastifyReply, status: number, html: string) {
  return reply
    .status(status)
    .header('content-type', 'text/html; charset=utf-8')
    .header('cache-control', 'public, max-age=300')
    .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'")
    .send(html)
}

const notFoundPage = (origin: string) =>
  renderSharePage({
    title: '見つかりません',
    description: 'この投稿は削除されたか存在しません',
    path: '/',
    origin,
  })

export function registerShareRoutes(app: FastifyInstance, deps: { db: Db; origin: string }): void {
  const { db, origin } = deps

  app.get('/s/p/:id', async (request, reply) => {
    const parsed = idParams.safeParse(request.params)
    const post = parsed.success ? await findVisiblePost(db, parsed.data.id) : null
    const thread = post ? await findThread(db, post.threadId) : null
    if (!post || !thread) return sendHtml(reply, 404, notFoundPage(origin))
    const who = post.authorName ?? '名無し'
    return sendHtml(
      reply,
      200,
      renderSharePage({
        title: post.title ?? `${thread.thread.title} #${post.seq}`,
        description: `${who} の声 ・ ${thread.topic.title}`,
        path: `/posts/${post.id}`,
        origin,
        audioUrl: post.audioUrl,
      }),
    )
  })

  app.get('/s/t/:id', async (request, reply) => {
    const parsed = idParams.safeParse(request.params)
    const found = parsed.success ? await findThread(db, parsed.data.id) : null
    if (!found || found.postCount === 0) return sendHtml(reply, 404, notFoundPage(origin))
    return sendHtml(
      reply,
      200,
      renderSharePage({
        title: found.thread.title,
        description: `${found.topic.title} ・ ${found.postCount} 件の声`,
        path: `/threads/${found.thread.id}`,
        origin,
      }),
    )
  })
}
