import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { fixturePath } from '../../test/helpers/multipart.ts'
import {
  buildTranscodeArgs,
  execTool,
  MediaToolError,
  parseProbe,
  probe,
  transcodeToM4a,
} from './ffmpeg.ts'

function hasFfmpeg(): boolean {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

describe('buildTranscodeArgs', () => {
  const args = buildTranscodeArgs('/in.webm', '/out.m4a')

  it('includes loudnorm and silence trimming', () => {
    const af = args[args.indexOf('-af') + 1]!
    expect(af).toContain('loudnorm=I=-16')
    expect(af.match(/silenceremove/g)).toHaveLength(2)
  })

  it('outputs mono AAC 64k with faststart and no metadata or video', () => {
    expect(args).toEqual(
      expect.arrayContaining(['-vn', '-ac', '1', '-c:a', 'aac', '-b:a', '64k', '+faststart']),
    )
    expect(args[args.indexOf('-map_metadata') + 1]).toBe('-1')
  })

  it('caps the duration at 90 seconds and keeps input/output order', () => {
    expect(args[args.indexOf('-t') + 1]).toBe('90')
    expect(args[args.indexOf('-i') + 1]).toBe('/in.webm')
    expect(args.at(-1)).toBe('/out.m4a')
  })
})

describe('parseProbe', () => {
  it('reads audio codec and duration', () => {
    const json = JSON.stringify({
      streams: [{ codec_type: 'audio', codec_name: 'opus' }],
      format: { duration: '1.234' },
    })
    expect(parseProbe(json)).toEqual({
      hasAudio: true,
      hasVideo: false,
      audioCodec: 'opus',
      durationMs: 1234,
    })
  })

  it('falls back to stream duration and flags video', () => {
    const json = JSON.stringify({
      streams: [
        { codec_type: 'video', codec_name: 'mjpeg' },
        { codec_type: 'audio', codec_name: 'aac', duration: '2' },
      ],
    })
    expect(parseProbe(json)).toMatchObject({ hasVideo: true, durationMs: 2000 })
  })

  it('handles missing streams and bad durations', () => {
    expect(parseProbe('{}')).toEqual({
      hasAudio: false,
      hasVideo: false,
      audioCodec: null,
      durationMs: null,
    })
    expect(parseProbe('{"format":{"duration":"N/A"}}').durationMs).toBeNull()
  })

  it('throws on non-JSON output', () => {
    expect(() => parseProbe('oops')).toThrow(MediaToolError)
  })
})

describe('execTool', () => {
  it('rejects with a MediaToolError including stderr tail', async () => {
    await expect(
      execTool('node', ['-e', 'console.error("bad input"); process.exit(3)'], 5_000),
    ).rejects.toThrow(/exit 3: bad input/)
  })

  it('fails with timeout error on hanging process', async () => {
    await expect(execTool('node', ['-e', 'setTimeout(() => {}, 10000)'], 200)).rejects.toThrow(
      /timed out/,
    )
  })

  it('passes through stdout', async () => {
    await expect(
      execTool('node', ['-e', 'process.stdout.write("hi")'], 5_000),
    ).resolves.toMatchObject({ stdout: 'hi' })
  })
})

describe('probe with injected exec', () => {
  it('calls ffprobe with JSON output', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: '{"streams":[]}', stderr: '' })
    await probe('/x.webm', exec)
    expect(exec).toHaveBeenCalledWith(
      'ffprobe',
      expect.arrayContaining(['-print_format', 'json', '/x.webm']),
      expect.any(Number),
    )
  })
})

describe.skipIf(!hasFfmpeg())('real ffmpeg', () => {
  let dir: string
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'ffmpeg-'))
  })
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('reports opus for webm fixture and aac for m4a fixture', async () => {
    expect((await probe(fixturePath('sample.webm'))).audioCodec).toBe('opus')
    expect((await probe(fixturePath('sample.m4a'))).audioCodec).toBe('aac')
  })

  it('detects a video stream', async () => {
    expect((await probe(fixturePath('with-video.webm'))).hasVideo).toBe(true)
  })

  it('produces m4a with faststart from webm', async () => {
    const out = path.join(dir, 'out.m4a')
    await transcodeToM4a(fixturePath('sample.webm'), out)
    const info = await probe(out)
    expect(info).toMatchObject({ audioCodec: 'aac', hasVideo: false })
    expect((await stat(out)).size).toBeGreaterThan(1000)
  })

  it('trims leading silence but keeps the speech', async () => {
    const out = path.join(dir, 'trimmed.m4a')
    await transcodeToM4a(fixturePath('leading-silence.webm'), out)
    const { durationMs } = await probe(out)
    expect(durationMs).toBeGreaterThan(900)
    expect(durationMs).toBeLessThan(1700)
  })

  it('rejects garbage input', async () => {
    const out = path.join(dir, 'bad.m4a')
    await expect(transcodeToM4a(import.meta.filename, out)).rejects.toThrow(MediaToolError)
  })
})
