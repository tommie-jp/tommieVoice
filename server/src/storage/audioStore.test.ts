import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAudioStore, type AudioStore } from './audioStore.ts'

const ID = '0b3c9a34-6f0e-4f3b-9d8a-1f2e3d4c5b6a'
const REL = `2026/09/${ID}.webm`
const WEBM = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4, 5, 6, 7, 8])

describe('audioStore', () => {
  let root: string
  let store: AudioStore

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'store-'))
    store = createAudioStore(root)
    await store.ensureDirs()
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('receives a stream, reports size and sniffed type', async () => {
    const received = await store.receive(Readable.from([WEBM]))
    expect(received.sizeBytes).toBe(WEBM.length)
    expect(received.mime).toBe('audio/webm')
  })

  it('reports null mime for non-audio bytes', async () => {
    const received = await store.receive(Readable.from([Buffer.from('<html>hello</html>')]))
    expect(received.mime).toBeNull()
    await store.discard(received.tmpPath)
    expect(await readdir(path.join(root, 'tmp'))).toEqual([])
  })

  it('removes the temp file when the stream fails', async () => {
    const failing = new Readable({
      read() {
        this.destroy(Object.assign(new Error('too large'), { statusCode: 413 }))
      },
    })
    await expect(store.receive(failing)).rejects.toThrow('too large')
    expect(await readdir(path.join(root, 'tmp'))).toEqual([])
  })

  it('commits into the area and copies between areas', async () => {
    const received = await store.receive(Readable.from([WEBM]))
    await store.commit(received.tmpPath, 'original', REL)
    await store.copy('original', REL, 'public', REL)
    expect(await readFile(store.absolute('public', REL))).toEqual(WEBM)
  })

  it('moves files between areas and reports missing sources', async () => {
    const received = await store.receive(Readable.from([WEBM]))
    await store.commit(received.tmpPath, 'public', REL)
    await expect(store.move('public', 'quarantine', REL)).resolves.toBe(true)
    expect(await readFile(store.absolute('quarantine', REL))).toEqual(WEBM)
    await expect(store.move('public', 'quarantine', REL)).resolves.toBe(false)
  })

  it('opens a stored file for reading', async () => {
    const received = await store.receive(Readable.from([WEBM]))
    await store.commit(received.tmpPath, 'original', REL)
    const chunks: Buffer[] = []
    for await (const c of store.openRead('original', REL)) chunks.push(c as Buffer)
    expect(Buffer.concat(chunks)).toEqual(WEBM)
  })

  it('remove ignores missing files', async () => {
    await expect(store.remove('public', REL)).resolves.toBeUndefined()
  })

  it('discard refuses paths outside the temp dir', async () => {
    await expect(store.discard('/etc/passwd')).rejects.toThrow()
  })
})
