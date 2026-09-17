import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify'
import { z } from 'zod'
import { okEnvelope } from '../../../../shared/envelope.ts'
import { adminPostUpdateSchema } from '../../../../shared/schemas/report.ts'
import type { Db } from '../../db/client.ts'
import type { AudioArea } from '../../lib/audioPaths.ts'
import type { Clock } from '../../lib/clock.ts'
import { conflict, notFound } from '../../lib/errors.ts'
import type { AudioStore } from '../../storage/audioStore.ts'
import { setPostStatus } from '../posts/repo.ts'
import { findAdminPost, listOpenReports, resolveReports, toAdminPost } from '../reports/repo.ts'

const idParams = z.object({ id: z.uuid() })

export type AdminPostDeps = {
  db: Db
  store: AudioStore
  clock: Clock
  requireAdmin: preHandlerAsyncHookHandler
}

const MIME_BY_EXT: Readonly<Record<string, string>> = {
  m4a: 'audio/mp4',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
}

export function registerAdminPostRoutes(app: FastifyInstance, deps: AdminPostDeps): void {
  const { db, store, clock, requireAdmin } = deps
  const guard = { preHandler: requireAdmin }

  app.get('/api/admin/reports', guard, async () => okEnvelope(await listOpenReports(db)))

  app.post('/api/admin/posts/:id/resolve-reports', guard, async (request) => {
    const { id } = idParams.parse(request.params)
    const resolved = await resolveReports(db, id, clock.now())
    return okEnvelope({ postId: id, resolved })
  })

  app.get('/api/admin/posts/:id', guard, async (request) => {
    const { id } = idParams.parse(request.params)
    const found = await findAdminPost(db, id)
    if (!found) throw notFound('投稿が見つかりません')
    return okEnvelope(toAdminPost(found))
  })

  /** 非表示の投稿も管理者は聴けるようにする */
  app.get('/api/admin/posts/:id/audio', guard, async (request, reply) => {
    const { id } = idParams.parse(request.params)
    const found = await findAdminPost(db, id)
    if (!found) throw notFound('投稿が見つかりません')
    const { post } = found
    const candidates: [AudioArea, string | null][] = [
      ['public', post.publicPath],
      ['quarantine', post.publicPath],
      ['original', post.originalPath],
    ]
    for (const [area, rel] of candidates) {
      if (!rel) continue
      const stream = store.openRead(area, rel)
      const opened = await new Promise<boolean>((resolve) => {
        stream.once('open', () => resolve(true))
        stream.once('error', () => resolve(false))
      })
      if (!opened) continue
      const ext = rel.split('.').pop() ?? ''
      return reply
        .header('content-type', MIME_BY_EXT[ext] ?? 'application/octet-stream')
        .header('cache-control', 'no-store')
        .send(stream)
    }
    throw notFound('音声ファイルがありません')
  })

  app.patch('/api/admin/posts/:id', guard, async (request) => {
    const { id } = idParams.parse(request.params)
    const { status } = adminPostUpdateSchema.parse(request.body)
    const found = await findAdminPost(db, id)
    if (!found || found.post.status === 'deleted') throw notFound('投稿が見つかりません')
    const { post } = found

    if (status === 'deleted') {
      await setPostStatus(db, id, 'deleted')
      const removals: Promise<void>[] = [store.remove('original', post.originalPath)]
      if (post.publicPath) {
        removals.push(
          store.remove('public', post.publicPath),
          store.remove('quarantine', post.publicPath),
        )
      }
      await Promise.all(removals)
    } else if (status === 'hidden') {
      if (post.publicPath) await store.move('public', 'quarantine', post.publicPath)
      await setPostStatus(db, id, 'hidden')
    } else {
      if (post.status !== 'hidden') throw conflict('非表示の投稿だけを戻せます')
      if (!post.publicPath) throw conflict('変換前に非表示にした投稿は戻せません')
      await store.move('quarantine', 'public', post.publicPath)
      await setPostStatus(db, id, 'ready')
    }
    if (status !== 'ready') await resolveReports(db, id, clock.now())
    request.log.info({ postId: id, status }, 'post status changed by admin')
    const updated = await findAdminPost(db, id)
    return okEnvelope(updated ? toAdminPost(updated) : null)
  })
}
