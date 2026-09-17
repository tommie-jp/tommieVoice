import { PUBLIC_POST_STATUSES, type PostPublic } from '../../../../shared/schemas/post.ts'
import type { PostRow } from '../../db/schema/index.ts'
import { publicAudioUrl } from '../../lib/audioPaths.ts'

export const VISIBLE_STATUSES = PUBLIC_POST_STATUSES

export function isVisibleStatus(status: PostRow['status']): status is 'processing' | 'ready' {
  return (VISIBLE_STATUSES as readonly string[]).includes(status)
}

export function toPostPublic(row: PostRow, parentSeq: number | null): PostPublic {
  if (!isVisibleStatus(row.status)) throw new Error('post is not publicly visible')
  const audioUrl =
    row.status === 'ready' && row.publicPath !== null ? publicAudioUrl(row.publicPath) : null
  return {
    id: row.id,
    threadId: row.threadId,
    seq: row.seq,
    parentPostId: row.parentPostId,
    parentSeq,
    title: row.title,
    authorName: row.authorName,
    durationMs: row.durationMs,
    status: row.status,
    audioUrl,
    reviewStatus: row.reviewStatus,
    airedAt: row.airedAt?.toISOString() ?? null,
    airedRef: row.airedRef,
    createdAt: row.createdAt.toISOString(),
  }
}
