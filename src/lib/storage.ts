// localStorage はプライベートモード等で例外を投げることがあるため必ず包む。
const memory = new Map<string, string>()

export function readStorage(key: string): string | null {
  try {
    const value = window.localStorage.getItem(key)
    return value ?? memory.get(key) ?? null
  } catch {
    return memory.get(key) ?? null
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
    memory.delete(key)
  } catch {
    // 書けないときだけメモリに保持する
    memory.set(key, value)
  }
}

export function removeStorage(key: string): void {
  memory.delete(key)
  try {
    window.localStorage.removeItem(key)
  } catch {
    // 何もしない
  }
}

export function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeSession(key: string, value: string | null): void {
  try {
    if (value === null) window.sessionStorage.removeItem(key)
    else window.sessionStorage.setItem(key, value)
  } catch {
    // 何もしない
  }
}
