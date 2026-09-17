import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../../../shared/constants.ts'
import { okEnvelope } from '../../../../shared/envelope.ts'
import { replyFieldsSchema, threadFieldsSchema } from '../../../../shared/schemas/post.ts'
import { topicSlugSchema } from '../../../../shared/schemas/topic.ts'
import { decodeCursor, encodeCursor } from '../../lib/cursor.ts'
import { AppError, badRequest, notFound } from '../../lib/errors.ts'
import { newId } from '../../lib/ids.ts'
import { routeRateLimit } from '../../plugins/rateLimit.ts'
import { findTopicBySlug } from '../topics/repo.ts'
import {
  findLivePost,
  findVisiblePost,
  listVisiblePosts,
  parentBelongsToThread,
} from '../posts/repo.ts'
import {
  assertNoNgWords,
  preparePost,
  publishPost,
  type PostServiceDeps,
  type PreparedPost,
} from '../posts/service.ts'
import { appendPost, createThreadWithPost, findThread, listThreads, summarize } from './repo.ts'

const slugParams = z.object({ slug: topicSlugSchema })
const idParams = z.object({ id: z.uuid() })
const listQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
})

const topicClosed = () => new AppError(403, 'topic_closed', 'このトピックは受付を終了しました')

/** フィールド検証や DB 登録に失敗したら原本を消してから投げ直す */
async function withRollback<T>(prepared: PreparedPost, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    await prepared.rollback()
    throw err
  }
}

export function registerThreadRoutes(app: FastifyInstance, deps: PostServiceDeps): void {
  const { db } = deps
  const uploadLimit = { config: routeRateLimit(deps.limits.upload) }

  app.get('/api/topics/:slug/threads', async (request) => {
    const { slug } = slugParams.parse(request.params)
    const query = listQuery.parse(request.query)
    const topic = await findTopicBySlug(db, slug)
    if (!topic) throw notFound('トピックが見つかりません')
    const page = await listThreads(db, topic, decodeCursor(query.cursor), query.limit)
    return okEnvelope(page.items, { nextCursor: page.next ? encodeCursor(page.next) : null })
  })

  app.post('/api/topics/:slug/threads', uploadLimit, async (request, reply) => {
    const { slug } = slugParams.parse(request.params)
    const topic = await findTopicBySlug(db, slug)
    if (!topic) throw notFound('トピックが見つかりません')
    if (topic.isClosed) throw topicClosed()

    const prepared = await preparePost(deps, request)
    const threadId = newId()
    await withRollback(prepared, async () => {
      const fields = threadFieldsSchema.parse(prepared.fields)
      assertNoNgWords(deps.ngWords, fields)
      await createThreadWithPost(db, {
        threadId,
        topicId: topic.id,
        title: fields.title,
        now: prepared.now,
        post: {
          ...prepared.values,
          ...fields,
          reviewStatus: topic.mode === 'inbox' ? 'pending' : null,
        },
      })
    })
    await publishPost(deps, prepared, request.log)

    // 凸待ち箱では公開前でも投稿者に受付結果を返す。変換に失敗したら null
    const post = await findLivePost(db, prepared.id)
    const found = post ? await findThread(db, threadId) : null
    const thread = found && found.postCount > 0 ? found : null
    return reply.status(201).send(
      okEnvelope({
        thread: thread ? summarize(thread) : null,
        post,
        deleteToken: prepared.deleteToken,
      }),
    )
  })

  app.get('/api/threads/:id', async (request) => {
    const { id } = idParams.parse(request.params)
    const found = await findThread(db, id)
    if (!found || found.postCount === 0) throw notFound('スレッドが見つかりません')
    return okEnvelope({
      thread: {
        ...summarize(found),
        topicTitle: found.topic.title,
        topicIsClosed: found.topic.isClosed,
      },
      posts: await listVisiblePosts(db, id),
    })
  })

  app.post('/api/threads/:id/posts', uploadLimit, async (request, reply) => {
    const { id } = idParams.parse(request.params)
    const found = await findThread(db, id)
    if (!found || found.postCount === 0) throw notFound('スレッドが見つかりません')
    if (found.topic.isClosed) throw topicClosed()

    const prepared = await preparePost(deps, request)
    await withRollback(prepared, async () => {
      const fields = replyFieldsSchema.parse(prepared.fields)
      assertNoNgWords(deps.ngWords, fields)
      if (fields.parentPostId && !(await parentBelongsToThread(db, fields.parentPostId, id))) {
        throw badRequest('返信先の投稿がこのスレッドにありません')
      }
      const seq = await appendPost(db, {
        threadId: id,
        now: prepared.now,
        post: {
          ...prepared.values,
          ...fields,
          reviewStatus: found.topic.mode === 'inbox' ? 'pending' : null,
        },
      })
      if (seq === null) throw notFound('スレッドが見つかりません')
    })
    await publishPost(deps, prepared, request.log)

    return reply.status(201).send(
      okEnvelope({
        post: await findLivePost(db, prepared.id),
        deleteToken: prepared.deleteToken,
      }),
    )
  })

  app.get('/api/posts/:id', async (request) => {
    const { id } = idParams.parse(request.params)
    const post = await findVisiblePost(db, id)
    if (!post) throw notFound('投稿が見つかりません')
    return okEnvelope(post)
  })
}
