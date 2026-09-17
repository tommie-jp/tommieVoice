import { createReadStream, createWriteStream } from 'node:fs'
import { copyFile, mkdir, open, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { AcceptedAudioMime } from '../../../shared/constants.ts'
import { type AudioArea, resolveAudioPath } from '../lib/audioPaths.ts'
import { newId } from '../lib/ids.ts'
import { SNIFF_BYTES, sniffAudio } from '../lib/sniffAudio.ts'

export type ReceivedFile = {
  readonly tmpPath: string
  readonly sizeBytes: number
  /** 先頭バイトで判定した形式。音声でなければ null */
  readonly mime: AcceptedAudioMime | null
}

export type AudioStore = {
  readonly root: string
  ensureDirs(): Promise<void>
  receive(stream: Readable): Promise<ReceivedFile>
  commit(tmpPath: string, area: AudioArea, relative: string): Promise<void>
  copy(from: AudioArea, fromRel: string, to: AudioArea, toRel: string): Promise<void>
  move(from: AudioArea, to: AudioArea, relative: string): Promise<boolean>
  remove(area: AudioArea, relative: string): Promise<void>
  discard(tmpPath: string): Promise<void>
  absolute(area: AudioArea, relative: string): string
  openRead(area: AudioArea, relative: string): Readable
}

async function readHead(file: string): Promise<Uint8Array> {
  const handle = await open(file, 'r')
  try {
    const buf = Buffer.alloc(SNIFF_BYTES)
    const { bytesRead } = await handle.read(buf, 0, SNIFF_BYTES, 0)
    return buf.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

export function createAudioStore(root: string): AudioStore {
  const tmpDir = path.resolve(root, 'tmp')

  const absolute = (area: AudioArea, relative: string) => resolveAudioPath(root, area, relative)

  const ensureParent = (file: string) => mkdir(path.dirname(file), { recursive: true })

  return {
    root,
    absolute,
    async ensureDirs() {
      await Promise.all(
        ['original', 'public', 'quarantine', 'tmp'].map((d) =>
          mkdir(path.resolve(root, d), { recursive: true }),
        ),
      )
    },
    async receive(stream) {
      const tmpPath = path.join(tmpDir, `${newId()}.upload`)
      await mkdir(tmpDir, { recursive: true })
      try {
        await pipeline(stream, createWriteStream(tmpPath, { flags: 'wx' }))
        const [info, head] = await Promise.all([stat(tmpPath), readHead(tmpPath)])
        return { tmpPath, sizeBytes: info.size, mime: sniffAudio(head) }
      } catch (err) {
        await rm(tmpPath, { force: true })
        throw err
      }
    },
    async commit(tmpPath, area, relative) {
      const target = absolute(area, relative)
      await ensureParent(target)
      await rename(tmpPath, target)
    },
    async copy(from, fromRel, to, toRel) {
      const target = absolute(to, toRel)
      await ensureParent(target)
      await copyFile(absolute(from, fromRel), target)
    },
    async move(from, to, relative) {
      const target = absolute(to, relative)
      await ensureParent(target)
      try {
        await rename(absolute(from, relative), target)
        return true
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false
        throw err
      }
    },
    async remove(area, relative) {
      await rm(absolute(area, relative), { force: true })
    },
    async discard(tmpPath) {
      if (!tmpPath.startsWith(tmpDir + path.sep)) throw new Error('not a temp upload path')
      await rm(tmpPath, { force: true })
    },
    openRead(area, relative) {
      return createReadStream(absolute(area, relative))
    },
  }
}
