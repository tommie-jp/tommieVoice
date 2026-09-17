import type { PgBoss } from 'pg-boss'
import type { MediaPipeline } from '../modules/posts/media.ts'
import { QUEUES, type TranscodeJob } from './boss.ts'

/** 投稿を processing のまま返し、変換はワーカーに任せる */
export function createQueuePipeline(boss: Pick<PgBoss, 'send'>): MediaPipeline {
  return {
    async afterUpload(post) {
      const data: TranscodeJob = { postId: post.id }
      await boss.send(QUEUES.transcode, data, { singletonKey: post.id })
      return null
    },
  }
}
