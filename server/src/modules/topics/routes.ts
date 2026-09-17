import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify'
import { z } from 'zod'
import { okEnvelope } from '../../../../shared/envelope.ts'
import { topicCreateSchema, topicUpdateSchema } from '../../../../shared/schemas/topic.ts'
import type { Db } from '../../db/client.ts'
import { badRequest, conflict, notFound } from '../../lib/errors.ts'
import { newId } from '../../lib/ids.ts'
import { findTopicWithCount, insertTopic, listTopics, updateTopic } from './repo.ts'

export type TopicRouteDeps = { db: Db; requireAdmin: preHandlerAsyncHookHandler }

const idParams = z.object({ id: z.uuid() })

export function registerTopicRoutes(app: FastifyInstance, deps: TopicRouteDeps): void {
  const { db, requireAdmin } = deps

  app.get('/api/topics', async () => okEnvelope(await listTopics(db)))

  app.post('/api/admin/topics', { preHandler: requireAdmin }, async (request, reply) => {
    const input = topicCreateSchema.parse(request.body)
    const inbox = input.mode === 'inbox'
    if (inbox && !input.ownerId) throw badRequest('凸待ち箱には配信者の指定が必要です')
    const row = await insertTopic(db, {
      id: newId(),
      ...input,
      ownerId: input.ownerId ?? null,
      // 設計メモ 03 の決定: 凸待ち箱は配信で流した後に公開し、文字起こしする
      publishOn: input.publishOn ?? (inbox ? 'aired' : 'immediately'),
      transcribe: input.transcribe ?? inbox,
    })
    if (!row) throw conflict('同じ slug のトピックがあります')
    return reply.status(201).send(okEnvelope(await findTopicWithCount(db, row.id)))
  })

  app.patch('/api/admin/topics/:id', { preHandler: requireAdmin }, async (request) => {
    const { id } = idParams.parse(request.params)
    const patch = topicUpdateSchema.parse(request.body)
    if (!(await updateTopic(db, id, patch))) throw notFound('トピックが見つかりません')
    return okEnvelope(await findTopicWithCount(db, id))
  })
}
