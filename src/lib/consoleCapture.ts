// ブラウザ console を横取りして画面内に出すためのキャプチャ機構
// iPhone など dev tools が無い端末でログ/エラーを確認するための仕組み
export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

export type LogEntry = {
  id: number
  time: number
  level: LogLevel
  text: string
}

type Listener = (entries: readonly LogEntry[]) => void

const LEVELS: LogLevel[] = ['log', 'info', 'warn', 'error', 'debug']
const DEFAULT_LIMIT = 200

let installed = false
let nextId = 1
let buffer: LogEntry[] = []
let limit = DEFAULT_LIMIT
const listeners = new Set<Listener>()
const originals = new Map<LogLevel, (...args: unknown[]) => void>()

function formatArg(a: unknown): string {
  if (typeof a === 'string') return a
  if (a instanceof Error) return `${a.name}: ${a.message}${a.stack ? `\n${a.stack}` : ''}`
  try {
    return JSON.stringify(a)
  } catch {
    return String(a)
  }
}

function push(level: LogLevel, args: unknown[]): void {
  const entry: LogEntry = {
    id: nextId++,
    time: Date.now(),
    level,
    text: args.map(formatArg).join(' '),
  }
  buffer.push(entry)
  if (buffer.length > limit) buffer = buffer.slice(buffer.length - limit)
  const snapshot = buffer.slice()
  listeners.forEach((l) => l(snapshot))
}

export function installConsoleCapture(options: { limit?: number } = {}): void {
  if (installed) return
  installed = true
  limit = options.limit ?? DEFAULT_LIMIT

  for (const level of LEVELS) {
    const original = console[level].bind(console)
    originals.set(level, original)
    console[level] = (...args: unknown[]) => {
      original(...args)
      push(level, args)
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('error', (e) => {
      push('error', [`window.error: ${e.message}`, e.filename, `${e.lineno}:${e.colno}`])
    })
    window.addEventListener('unhandledrejection', (e) => {
      push('error', ['unhandledrejection:', e.reason])
    })
  }
}

export function getLogs(): readonly LogEntry[] {
  return buffer
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  listener(buffer.slice())
  return () => listeners.delete(listener)
}

export function clearLogs(): void {
  buffer = []
  listeners.forEach((l) => l([]))
}

// テスト専用のリセット: console のラップも剥がす
export function __resetForTest(): void {
  for (const [level, original] of originals) {
    console[level] = original as typeof console.log
  }
  originals.clear()
  installed = false
  buffer = []
  nextId = 1
  limit = DEFAULT_LIMIT
  listeners.clear()
}
