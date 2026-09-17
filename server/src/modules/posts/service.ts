import type { FastifyRequest } from 'fastify'
import type { AcceptedAudioMime } from '../../../../shared/constants.ts'
import type { RateLimits } from '../../plugins/rateLimit.ts'
import type { Db } from '../../db/client.ts'
import { extensionFor, relativeAudioPath } from '../../lib/audioPaths.ts'
import type { Clock } from '../../lib/clock.ts'
import { badRequest, rateLimited } from '../../lib/errors.ts'
import { sha256Token } from '../../lib/hash.ts'
import type { NgWordChecker } from '../../lib/ngWords.ts'
import { newId, newToken } from '../../lib/ids.ts'
import { identify } from '../../plugins/identity.ts'
import type { AudioStore } from '../../storage/audioStore.ts'
import type { MediaPipeline } from './media.ts'
import { countRecentByDevice, markPostReady, type NewPost, setPostStatus } from './repo.ts'
import { readAudioUpload } from './upload.ts'
import { enqueueTranscription } from '../transcripts/jobs.ts'

export type PostServiceDeps = {
  ngWords: NgWordChecker
  db: Db
  store: AudioStore
  media: MediaPipeline
  clock: Clock
  hashKey: string
  limits: RateLimits
}

export type PreparedPost = {
  readonly id: string
  readonly mime: AcceptedAudioMime
  readonly now: Date
  readonly deleteToken: string
  readonly fields: Record<string, string>
  readonly values: NewPost
  /** DB 書き込みに失敗したときに原本を消す */
  rollback(): Promise<void>
}

async function enforceDeviceLimit(deps: PostServiceDeps, deviceIdHash: string, now: Date) {
  const { max, windowMs } = deps.limits.uploadPerDevice
  const recent = await countRecentByDevice(
    deps.db,
    deviceIdHash,
    new Date(now.getTime() - windowMs),
  )
  if (recent >= max) throw rateLimited(Math.ceil(windowMs / 1000))
}

/** 端末制限 → 受信 → 原本として保存。DB への登録は呼び出し側が行う */
export async function preparePost(
  deps: PostServiceDeps,
  request: FastifyRequest,
): Promise<PreparedPost> {
  const identity = identify(request, deps.hashKey)
  await enforceDeviceLimit(deps, identity.deviceIdHash, deps.clock.now())

  const { file, fields } = await readAudioUpload(request, deps.store)
  // 回線が遅いと受信に時間がかかるので、投稿時刻は受信完了後に取る
  const now = deps.clock.now()
  const id = newId()
  const originalPath = relativeAudioPath(now, id, extensionFor(file.mime))
  try {
    await deps.store.commit(file.tmpPath, 'original', originalPath)
  } catch (err) {
    await deps.store.discard(file.tmpPath)
    throw err
  }

  const deleteToken = newToken()
  return {
    id,
    mime: file.mime,
    now,
    deleteToken,
    fields,
    values: {
      id,
      parentPostId: null,
      title: null,
      authorName: null,
      deviceIdHash: identity.deviceIdHash,
      ipHash: identity.ipHash,
      deleteTokenHash: sha256Token(deleteToken),
      originalPath,
      originalMime: file.mime,
      durationMs: null,
      sizeBytes: file.sizeBytes,
      reviewStatus: null,
    },
    rollback: () => deps.store.remove('original', originalPath),
  }
}

/** 登録済み投稿の後処理（公開コピー or 変換ジョブ投入）。失敗しても投稿自体は残す */
export async function publishPost(
  deps: PostServiceDeps,
  prepared: PreparedPost,
  log: FastifyRequest['log'],
): Promise<void> {
  try {
    const result = await deps.media.afterUpload({
      id: prepared.id,
      originalPath: prepared.values.originalPath,
      originalMime: prepared.mime,
      createdAt: prepared.now,
    })
    if (result) {
      await markPostReady(deps.db, prepared.id, result)
      await enqueueTranscription(deps.db, prepared.id)
    }
  } catch (err) {
    log.error({ err, postId: prepared.id }, 'media pipeline failed')
    await setPostStatus(deps.db, prepared.id, 'failed')
  }
}

/** タイトルと名前に NG ワードが含まれていないか */
export function assertNoNgWords(
  checker: NgWordChecker,
  fields: { title?: string | null; authorName?: string | null },
): void {
  if (checker.matches(fields.title) || checker.matches(fields.authorName)) {
    throw badRequest('タイトルか名前に使えない言葉が含まれています')
  }
}
