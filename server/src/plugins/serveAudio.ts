import path from 'node:path'
import fastifyStatic from '@fastify/static'
import type { FastifyInstance } from 'fastify'

/** 開発・E2E 用に /audio/public/ を API から配信する（本番は nginx が配信） */
export async function registerAudioServing(app: FastifyInstance, audioDir: string): Promise<void> {
  await app.register(fastifyStatic, {
    root: path.resolve(audioDir, 'public'),
    prefix: '/audio/public/',
    decorateReply: false,
    index: false,
    list: false,
    dotfiles: 'deny',
    immutable: true,
    maxAge: '1y',
    setHeaders(res, filePath) {
      if (filePath.endsWith('.m4a')) res.header('content-type', 'audio/mp4')
      if (filePath.endsWith('.webm')) res.header('content-type', 'audio/webm')
      res.header('x-content-type-options', 'nosniff')
    },
  })
}
