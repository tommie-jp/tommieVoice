import { extensionFor, relativeAudioPath } from '../../lib/audioPaths.ts'
import type { AudioStore } from '../../storage/audioStore.ts'
import type { AcceptedAudioMime } from '../../../../shared/constants.ts'

export type UploadedPost = {
  readonly id: string
  readonly originalPath: string
  readonly originalMime: AcceptedAudioMime
  readonly createdAt: Date
}

/** 投稿保存後の処理。即時公開できたら公開パスを返し、非同期なら null を返す */
export type MediaPipeline = {
  afterUpload(post: UploadedPost): Promise<{ publicPath: string } | null>
}

/** 変換せずに原本を公開領域へコピーする（Phase 1 / テスト用） */
export function createCopyPipeline(store: AudioStore): MediaPipeline {
  return {
    async afterUpload(post) {
      const publicPath = relativeAudioPath(post.createdAt, post.id, extensionFor(post.originalMime))
      await store.copy('original', post.originalPath, 'public', publicPath)
      return { publicPath }
    },
  }
}
