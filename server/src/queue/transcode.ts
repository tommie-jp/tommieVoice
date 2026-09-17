import { stat } from 'node:fs/promises'
import path from 'node:path'
import type { Db } from '../db/client.ts'
import { relativeAudioPath } from '../lib/audioPaths.ts'
import { MediaToolError, probe, transcodeToM4a, type Exec } from '../lib/ffmpeg.ts'
import { newId } from '../lib/ids.ts'
import { findPostRow, markPostReady, setPostStatus } from '../modules/posts/repo.ts'
import type { AudioStore } from '../storage/audioStore.ts'
import { enqueueTranscription } from '../modules/transcripts/jobs.ts'

export type TranscodeDeps = {
  db: Db
  store: AudioStore
  exec?: Exec
  log?: (msg: string, extra?: Record<string, unknown>) => void
}

export type TranscodeOutcome = 'ready' | 'skipped' | 'rejected'

/**
 * 1 件の投稿を m4a に変換して公開する。冪等（processing 以外は何もしない）。
 * 一時的な失敗は例外で返し、キューに再試行させる。
 */
export async function transcodePost(
  deps: TranscodeDeps,
  postId: string,
): Promise<TranscodeOutcome> {
  const post = await findPostRow(deps.db, postId)
  if (!post || post.status !== 'processing') return 'skipped'

  const input = deps.store.absolute('original', post.originalPath)
  const info = await probe(input, deps.exec)
  if (!info.hasAudio || info.hasVideo) {
    await setPostStatus(deps.db, postId, 'failed')
    await deps.store.remove('original', post.originalPath)
    deps.log?.('rejected non-audio upload', { postId, hasVideo: info.hasVideo })
    return 'rejected'
  }

  const publicPath = relativeAudioPath(post.createdAt, post.id, 'm4a')
  const tmp = path.join(deps.store.root, 'tmp', `${newId()}.m4a`)
  try {
    await transcodeToM4a(input, tmp, deps.exec)
    const out = await probe(tmp, deps.exec)
    const { size } = await stat(tmp)
    await deps.store.commit(tmp, 'public', publicPath)
    await markPostReady(deps.db, postId, {
      publicPath,
      durationMs: out.durationMs ?? info.durationMs ?? post.durationMs ?? undefined,
      sizeBytes: size,
    })
    await enqueueTranscription(deps.db, postId)
  } catch (err) {
    await deps.store.discard(tmp).catch(() => {})
    throw err instanceof MediaToolError
      ? err
      : new MediaToolError('transcode failed', { cause: err })
  }
  return 'ready'
}

/** 再試行を使い切った投稿を失敗にする */
export async function markTranscodeFailed(db: Db, postId: string): Promise<void> {
  const post = await findPostRow(db, postId)
  if (post?.status === 'processing') await setPostStatus(db, postId, 'failed')
}
