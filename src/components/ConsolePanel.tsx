import { useCallback, useEffect, useRef, useState } from 'react'
import { clearLogs, subscribe, type LogEntry } from '../lib/consoleCapture'

function formatTime(ts: number): string {
  const d = new Date(ts)
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  const ss = d.getSeconds().toString().padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function entryToLine(e: LogEntry): string {
  return `[${formatTime(e.time)}] [${e.level}] ${e.text}`
}

export function ConsolePanel() {
  const [logs, setLogs] = useState<readonly LogEntry[]>([])
  const [open, setOpen] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'ng'>('idle')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => subscribe(setLogs), [])

  // 新しい行が入ったら末尾へ自動スクロール
  useEffect(() => {
    if (!open) return
    const ta = textareaRef.current
    if (ta) ta.scrollTop = ta.scrollHeight
  }, [logs, open])

  const text = logs.map(entryToLine).join('\n')

  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        textareaRef.current?.select()
        document.execCommand('copy')
      }
      setCopyState('ok')
    } catch {
      setCopyState('ng')
    }
    window.setTimeout(() => setCopyState('idle'), 1500)
  }, [text])

  return (
    <section className={`console-panel ${open ? 'is-open' : ''}`} aria-label="コンソールログ">
      <button
        type="button"
        className="console-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? '▼' : '▶'} ログ ({logs.length})
      </button>
      {open && (
        <>
          <div className="console-actions">
            <button type="button" className="console-btn" onClick={clearLogs}>
              クリア
            </button>
            <button type="button" className="console-btn" onClick={handleCopy}>
              {copyState === 'ok' ? 'コピー済' : copyState === 'ng' ? 'コピー失敗' : 'コピー'}
            </button>
          </div>
          <textarea
            ref={textareaRef}
            className="console-textarea"
            readOnly
            value={text}
            spellCheck={false}
          />
        </>
      )}
    </section>
  )
}
