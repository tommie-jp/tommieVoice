import type { WorkerJob } from '../../shared/schemas/transcript.ts'
import { setFetch } from './client'
import { streamerJobApi } from './worker'

const JOB: WorkerJob = {
  id: '50000000-0000-4000-8000-000000000001',
  postId: '30000000-0000-4000-8000-000000000001',
  leaseToken: 'L'.repeat(43),
  leaseUntil: '2026-09-18T12:15:00.000Z',
  durationMs: 1000,
  audioPath: '/api/worker/jobs/50000000-0000-4000-8000-000000000001/audio',
}

describe('streamerJobApi', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    setFetch((...args) => fetch(...args))
  })

  it('claims a job with the csrf header or returns null on 204', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: JOB, error: null })))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    await expect(streamerJobApi.claim('browser')).resolves.toEqual(JOB)
    const init = spy.mock.calls[0]![1]!
    expect(init.headers).toMatchObject({ 'x-requested-with': 'tommieVoice' })
    expect(JSON.parse(init.body as string)).toEqual({ workerId: 'browser' })
    await expect(streamerJobApi.claim('browser')).resolves.toBeNull()
  })

  it('reports claim failures', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false }), { status: 401 }))
      .mockRejectedValueOnce(new TypeError('offline'))
    await expect(streamerJobApi.claim('b')).rejects.toMatchObject({
      code: 'claim_failed',
      status: 401,
    })
    await expect(streamerJobApi.claim('b')).rejects.toMatchObject({ code: 'network_error' })
  })

  it('fetches audio with the lease token', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('m4a'))
      .mockResolvedValueOnce(new Response('no', { status: 403 }))
    expect(await (await streamerJobApi.fetchAudio(JOB)).text()).toBe('m4a')
    expect(spy.mock.calls[0]![1]!.headers).toMatchObject({ 'x-lease-token': 'L'.repeat(43) })
    await expect(streamerJobApi.fetchAudio(JOB)).rejects.toMatchObject({ status: 403 })
  })

  it('submits results and failures through the API client', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true, data: {}, error: null })),
    )
    setFetch(fetchMock as typeof fetch)
    await streamerJobApi.submit(JOB, {
      text: 't',
      segments: [],
      engine: 'e',
      model: 'm',
      language: 'ja',
    })
    await streamerJobApi.fail(JOB, 'x'.repeat(3000))
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    expect(calls[0]![0]).toBe(`/api/worker/jobs/${JOB.id}/result`)
    expect((calls[0]![1].headers as Record<string, string>)['x-lease-token']).toBe('L'.repeat(43))
    expect(JSON.parse(calls[1]![1].body as string).error).toHaveLength(2000)
  })
})
