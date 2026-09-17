import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { okEnvelope } from '../../../../shared/envelope.ts'
import type { Db } from '../../db/client.ts'
import { transcripts } from '../../db/schema/index.ts'
import { notFound } from '../../lib/errors.ts'
import { findVisiblePost } from '../posts/repo.ts'

const idParams = z.object({ id: z.uuid() })

export function registerTranscriptRoutes(app: FastifyInstance, deps: { db: Db }): void {
  app.get('/api/posts/:id/transcript', async (request) => {
    const { id } = idParams.parse(request.params)
    if (!(await findVisiblePost(deps.db, id))) throw notFound('投稿が見つかりません')
    const [row] = await deps.db
      .select()
      .from(transcripts)
      .where(eq(transcripts.postId, id))
      .limit(1)
    if (!row) throw notFound('文字起こしはまだありません')
    return okEnvelope({
      postId: row.postId,
      engine: row.engine,
      language: row.language,
      text: row.text,
      segments: row.segments,
      summary: row.summary,
      tags: row.tags,
      riskFlags: row.riskFlags,
      createdAt: row.createdAt.toISOString(),
    })
  })
}
