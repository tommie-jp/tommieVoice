import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createTestContext, type TestContext } from '../../test/helpers/testApp.ts'

const REL = '2026/09/0b3c9a34-6f0e-4f3b-9d8a-1f2e3d4c5b6a.m4a'

async function seed(ctx: TestContext) {
  for (const area of ['public', 'original']) {
    const file = path.join(ctx.audioDir, area, REL)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, Buffer.alloc(1000, 7))
  }
}

describe('audio serving from the API (dev only)', () => {
  let ctx: TestContext | undefined
  afterEach(async () => {
    await ctx?.close()
    ctx = undefined
  })

  it('returns 206 for Range request with audio/mp4', async () => {
    ctx = await createTestContext({ env: { SERVE_AUDIO_FROM_API: 'true' } })
    await seed(ctx)
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/audio/public/${REL}`,
      headers: { range: 'bytes=0-99' },
    })
    expect(res.statusCode).toBe(206)
    expect(res.headers['content-type']).toBe('audio/mp4')
    expect(res.rawPayload.length).toBe(100)
  })

  it('does not serve /audio/original', async () => {
    ctx = await createTestContext({ env: { SERVE_AUDIO_FROM_API: 'true' } })
    await seed(ctx)
    const res = await ctx.app.inject({ method: 'GET', url: `/audio/original/${REL}` })
    expect(res.statusCode).toBe(404)
  })

  it('does not escape the public dir', async () => {
    ctx = await createTestContext({ env: { SERVE_AUDIO_FROM_API: 'true' } })
    await seed(ctx)
    const res = await ctx.app.inject({ method: 'GET', url: `/audio/public/../original/${REL}` })
    expect(res.statusCode).toBe(404)
  })

  it('is not registered unless enabled', async () => {
    ctx = await createTestContext()
    await seed(ctx)
    const res = await ctx.app.inject({ method: 'GET', url: `/audio/public/${REL}` })
    expect(res.statusCode).toBe(404)
  })
})
