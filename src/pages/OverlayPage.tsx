import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { overlayEventSchema, type OverlayPost } from '../../shared/schemas/overlay.ts'
import { segmentAt } from '../lib/overlay/subtitleSync'

type Connection = 'connecting' | 'open' | 'error'

export type EventSourceFactory = (url: string) => EventSource

const defaultFactory: EventSourceFactory = (url) => new EventSource(url)

/**
 * OBS のブラウザソースに貼るページ（/overlay/:token）。
 * 「今流す」の通知を受けて音声を再生し、字幕と投稿者名を表示する。背景は透過。
 */
export function OverlayPage({
  createSource = defaultFactory,
}: {
  createSource?: EventSourceFactory
}) {
  const { token = '' } = useParams()
  const [params] = useSearchParams()
  const size = Math.min(Math.max(Number(params.get('size')) || 36, 16), 96)
  const showStatus = !params.has('quiet')
  const [post, setPost] = useState<OverlayPost | null>(null)
  const [time, setTime] = useState(0)
  const [connection, setConnection] = useState<Connection>('connecting')
  const [streamerName, setStreamerName] = useState('')
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    document.documentElement.classList.add('overlay-mode')
    return () => document.documentElement.classList.remove('overlay-mode')
  }, [])

  useEffect(() => {
    const source = createSource(`/api/overlay/${encodeURIComponent(token)}/events`)
    const handle = (e: MessageEvent<string>) => {
      const parsed = overlayEventSchema.safeParse(JSON.parse(e.data))
      if (!parsed.success) return
      const event = parsed.data
      if (event.type === 'hello') setStreamerName(event.streamerName)
      if (event.type === 'play') {
        setTime(0)
        setPost(event.post)
      }
      if (event.type === 'stop') {
        audioRef.current?.pause()
        setPost(null)
      }
    }
    source.addEventListener('hello', handle as EventListener)
    source.addEventListener('play', handle as EventListener)
    source.addEventListener('stop', handle as EventListener)
    // EventSource は切断されても自動で再接続する
    source.onopen = () => setConnection('open')
    source.onerror = () => setConnection('error')
    return () => source.close()
  }, [token, createSource])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !post) return
    audio.src = post.audioUrl
    void audio.play()?.catch(() => setConnection('error'))
  }, [post])

  const subtitle = post ? segmentAt(post.segments, time) : null

  return (
    <div className="overlay" style={{ fontSize: `${size}px` }}>
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onEnded={() => setPost(null)}
        aria-label="オーバーレイ音声"
      />
      {post ? (
        <div className="overlay-card" role="status">
          <div className="overlay-from">
            🎙 {post.authorName ?? '名無し'}
            {post.title ? ` 「${post.title}」` : ''}
          </div>
          {subtitle ? <div className="overlay-subtitle">{subtitle.text}</div> : null}
        </div>
      ) : null}
      {showStatus ? (
        <div className={`overlay-status is-${connection}`}>
          {connection === 'open'
            ? `● ${streamerName}`
            : connection === 'connecting'
              ? '接続中…'
              : '再接続中…'}
        </div>
      ) : null}
    </div>
  )
}
