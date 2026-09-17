type Props = {
  status: 'idle' | 'recording'
  elapsedMs: number
  disabled?: boolean
  onToggle: () => void
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function RecordButton({ status, elapsedMs, disabled, onToggle }: Props) {
  const isRecording = status === 'recording'
  const label = isRecording ? '停止' : '録音'
  return (
    <div className="record-bar">
      {isRecording && (
        <div className="record-status" aria-live="polite">
          <span className="record-dot" aria-hidden />
          <span className="record-elapsed">{formatElapsed(elapsedMs)}</span>
        </div>
      )}
      <button
        type="button"
        className={`record-button ${isRecording ? 'is-recording' : ''}`}
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={isRecording}
        aria-label={label}
      >
        <span className="record-button-inner" aria-hidden />
        <span className="record-button-label">{label}</span>
      </button>
    </div>
  )
}
