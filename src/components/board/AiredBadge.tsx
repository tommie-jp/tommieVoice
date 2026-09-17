import { isSafeHttpUrl } from '../../lib/safeUrl'

export function AiredBadge({ airedRef }: { airedRef: string | null }) {
  if (isSafeHttpUrl(airedRef)) {
    return (
      <a className="aired-badge" href={airedRef} target="_blank" rel="noopener noreferrer nofollow">
        📺 配信で紹介されました
      </a>
    )
  }
  return <span className="aired-badge">📺 配信で紹介されました</span>
}
