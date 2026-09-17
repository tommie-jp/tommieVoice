import { memo } from 'react'
import type { PostPublic } from '../../../shared/schemas/post.ts'
import { formatDuration, formatRelative } from '../../lib/format'
import { AiredBadge } from './AiredBadge'

type Props = {
  post: PostPublic
  isCurrent: boolean
  isPlaying: boolean
  /** この端末で投稿したもの（削除トークンを持っている） */
  isMine?: boolean
  onPlay(post: PostPublic): void
  onReply(post: PostPublic): void
  onJump(seq: number): void
  onShare?(post: PostPublic): void
  onDelete?(post: PostPublic): void | Promise<void>
  onReport?(post: PostPublic): void
}

export const PostRow = memo(function PostRow({
  post,
  isCurrent,
  isPlaying,
  isMine = false,
  onPlay,
  onReply,
  onJump,
  onShare,
  onDelete,
  onReport,
}: Props) {
  const ready = post.status === 'ready' && post.audioUrl !== null
  return (
    <li id={`p${post.seq}`} className={`post-row ${isCurrent ? 'is-current' : ''}`}>
      <button
        type="button"
        className="play-button"
        onClick={() => onPlay(post)}
        disabled={!ready}
        aria-label={isCurrent && isPlaying ? `#${post.seq} を一時停止` : `#${post.seq} を再生`}
      >
        <span aria-hidden>{isCurrent && isPlaying ? '❚❚' : '▶'}</span>
      </button>
      <div className="post-body">
        <div className="post-meta">
          <span className="post-seq">#{post.seq}</span>
          <span className="post-author">{post.authorName ?? '名無し'}</span>
          <span className="post-time">{formatRelative(post.createdAt)}</span>
        </div>
        {post.parentSeq ? (
          <button type="button" className="anchor-link" onClick={() => onJump(post.parentSeq!)}>
            &gt;&gt;{post.parentSeq}
          </button>
        ) : null}
        {post.title ? <p className="post-title">{post.title}</p> : null}
        {post.reviewStatus === 'aired' ? <AiredBadge airedRef={post.airedRef} /> : null}
        <div className="post-foot">
          <span className="post-duration">
            {ready ? formatDuration(post.durationMs) : '変換中…'}
          </span>
          <span className="post-actions">
            {isMine && onDelete ? (
              <button
                type="button"
                className="text-button danger"
                onClick={() => void onDelete(post)}
                aria-label={`#${post.seq} を削除`}
              >
                削除
              </button>
            ) : null}
            {!isMine && onReport ? (
              <button
                type="button"
                className="text-button muted"
                onClick={() => onReport(post)}
                aria-label={`#${post.seq} を通報`}
              >
                通報
              </button>
            ) : null}
            {onShare ? (
              <button
                type="button"
                className="text-button"
                onClick={() => onShare(post)}
                aria-label={`#${post.seq} を共有`}
              >
                共有
              </button>
            ) : null}
            <button type="button" className="text-button" onClick={() => onReply(post)}>
              返事する
            </button>
          </span>
        </div>
      </div>
    </li>
  )
})
