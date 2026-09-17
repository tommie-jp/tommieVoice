import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { DELETE_TOKEN_HEADER } from '../../../../shared/constants.ts'
import { okEnvelope } from '../../../../shared/envelope.ts'
import type { Db } from '../../db/client.ts'
import { forbidden, notFound } from '../../lib/errors.ts'
import { sha256Token, timingSafeEqualStr } from '../../lib/hash.ts'
import type { AudioStore } from '../../storage/audioStore.ts'
import { findLivePost, findPostRow, setPostStatus } from './repo.ts'
import { isVisibleStatus } from './serialize.ts'

const idParams = z.object({ id: z.uuid() })
const tokenSchema = z.string().min(20).max(200)
const MINE_MAX = 50
const mineSchema = z.object({
  items: z.array(z.object({ id: z.uuid(), token: tokenSchema })).max(MINE_MAX),
})

export function registerPostRoutes(
  app: FastifyInstance,
  deps: { db: Db; store: AudioStore },
): void {
  const { db, store } = deps

  /** 自分の投稿（端末に保存した削除トークンで本人確認）の状態をまとめて返す */
  app.post('/api/posts/mine', async (request) => {
    const { items } = mineSchema.parse(request.body)
    const results = await Promise.all(
      items.map(async ({ id, token }) => {
        const row = await findPostRow(db, id)
        if (!row || !timingSafeEqualStr(sha256Token(token), row.deleteTokenHash)) return null
        return findLivePost(db, id)
      }),
    )
    return okEnvelope(results.filter((p) => p !== null))
  })

  /** 本人削除: 投稿時に受け取った削除トークンで消す。行は残し、音声ファイルは消す */
  app.delete('/api/posts/:id', async (request) => {
    const { id } = idParams.parse(request.params)
    const raw = request.headers[DELETE_TOKEN_HEADER]
    const token = tokenSchema.safeParse(Array.isArray(raw) ? raw[0] : raw)
    const post = await findPostRow(db, id)
    if (!post || !isVisibleStatus(post.status)) throw notFound('投稿が見つかりません')
    if (!token.success || !timingSafeEqualStr(sha256Token(token.data), post.deleteTokenHash)) {
      throw forbidden('この投稿を削除する権限がありません')
    }
    await setPostStatus(db, id, 'deleted')
    await Promise.all([
      store.remove('original', post.originalPath),
      post.publicPath ? store.remove('public', post.publicPath) : Promise.resolve(),
    ])
    request.log.info({ postId: id }, 'post deleted by owner')
    return okEnvelope({ id, deleted: true })
  })
}
