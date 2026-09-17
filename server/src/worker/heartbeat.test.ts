import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { startHeartbeat } from './heartbeat.ts'

describe('startHeartbeat', () => {
  it('does nothing without a file', () => {
    const stop = startHeartbeat(undefined)
    expect(typeof stop).toBe('function')
    stop()
  })

  it('writes the file immediately', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'hb-'))
    const file = path.join(dir, 'beat')
    const stop = startHeartbeat(file, 60_000)
    await vi.waitFor(async () => expect(Number(await readFile(file, 'utf8'))).toBeGreaterThan(0))
    stop()
    await rm(dir, { recursive: true, force: true })
  })

  it('reports write errors', async () => {
    const onError = vi.fn()
    const stop = startHeartbeat('/nonexistent-dir/beat', 60_000, onError)
    await vi.waitFor(() => expect(onError).toHaveBeenCalled())
    stop()
  })
})
