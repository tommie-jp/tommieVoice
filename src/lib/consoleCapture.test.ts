import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetForTest,
  clearLogs,
  getLogs,
  installConsoleCapture,
  subscribe,
} from './consoleCapture'

describe('consoleCapture', () => {
  beforeEach(() => {
    __resetForTest()
  })

  afterEach(() => {
    __resetForTest()
  })

  it('captures console.log after install and still calls the original', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    installConsoleCapture()
    console.log('hello', 42)
    expect(spy).toHaveBeenCalledWith('hello', 42)
    const logs = getLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ level: 'log', text: 'hello 42' })
    spy.mockRestore()
  })

  it('captures multiple levels', () => {
    installConsoleCapture()
    console.info('i')
    console.warn('w')
    console.error('e')
    expect(getLogs().map((l) => l.level)).toEqual(['info', 'warn', 'error'])
  })

  it('formats Error instances with message and stack', () => {
    installConsoleCapture()
    console.error(new Error('boom'))
    const [entry] = getLogs()
    expect(entry.text).toContain('Error: boom')
  })

  it('respects the ring buffer limit', () => {
    installConsoleCapture({ limit: 3 })
    console.log('a')
    console.log('b')
    console.log('c')
    console.log('d')
    expect(getLogs().map((l) => l.text)).toEqual(['b', 'c', 'd'])
  })

  it('notifies subscribers on new entries and clear', () => {
    installConsoleCapture()
    const received: number[] = []
    const unsub = subscribe((entries) => received.push(entries.length))
    console.log('x')
    console.log('y')
    clearLogs()
    unsub()
    console.log('z') // 購読解除後は届かない
    expect(received).toEqual([0, 1, 2, 0])
  })

  it('install is idempotent', () => {
    installConsoleCapture()
    installConsoleCapture()
    console.log('once')
    expect(getLogs()).toHaveLength(1)
  })
})
