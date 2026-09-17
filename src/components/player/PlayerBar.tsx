import { usePlayer } from '../../hooks/usePlayer'
import { formatDuration } from '../../lib/format'
import { currentItem, PLAYBACK_RATES } from '../../lib/player'

export function PlayerBar() {
  const { player, state } = usePlayer()
  const item = currentItem(state)
  if (!item) return null

  const nextRate =
    PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(state.rate as 1) + 1) % PLAYBACK_RATES.length]!
  const max = state.duration > 0 ? state.duration : 0

  return (
    <div className="player-bar" role="region" aria-label="再生中">
      <button
        type="button"
        className="player-toggle"
        onClick={() => player.toggle()}
        aria-label={state.playing ? '一時停止' : '再生'}
      >
        {state.playing ? '❚❚' : '▶'}
      </button>
      <div className="player-main">
        <div className="player-label">
          {item.label}
          {state.loading ? <span className="player-loading"> 読み込み中…</span> : null}
        </div>
        <input
          type="range"
          className="player-seek"
          min={0}
          max={max}
          step={0.1}
          value={Math.min(state.currentTime, max)}
          onChange={(e) => player.seek(Number(e.target.value))}
          aria-label="再生位置"
          disabled={max === 0}
        />
        <div className="player-time">
          {formatDuration(state.currentTime * 1000)} / {formatDuration(max * 1000)}
        </div>
        {state.error ? (
          <div className="player-error" role="alert">
            {state.error}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="player-rate"
        onClick={() => player.setRate(nextRate)}
        aria-label={`再生速度 ${state.rate} 倍`}
      >
        {state.rate}x
      </button>
      <button
        type="button"
        className="player-close"
        onClick={() => player.stop()}
        aria-label="再生を閉じる"
      >
        ×
      </button>
    </div>
  )
}
