import { z } from 'zod'
import { ApiError, apiRequest, errorMessage, setFetch } from './client'

function respond(body: unknown, status = 200) {
  return vi
    .fn()
    .mockResolvedValue(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
    )
}

describe('apiRequest', () => {
  afterEach(() => setFetch((...args) => fetch(...args)))

  it('unwraps ok envelope and validates data', async () => {
    setFetch(respond({ ok: true, data: { n: 1 }, error: null, meta: { nextCursor: 'c' } }))
    const result = await apiRequest('/api/x', z.object({ n: z.number() }))
    expect(result).toEqual({ data: { n: 1 }, meta: { nextCursor: 'c' } })
  })

  it('throws ApiError with code on error envelope', async () => {
    setFetch(
      respond(
        {
          ok: false,
          data: null,
          error: { code: 'rate_limited', message: '多すぎ', retryAfterSeconds: 9 },
        },
        429,
      ),
    )
    const err = await apiRequest('/api/x', z.unknown()).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 429, code: 'rate_limited', retryAfterSeconds: 9 })
    expect(errorMessage(err)).toBe('多すぎ（あと約 9 秒）')
  })

  it('attaches device id header and JSON body', async () => {
    const fetchMock = respond({ ok: true, data: null, error: null })
    setFetch(fetchMock)
    await apiRequest('/api/x', z.null(), {
      method: 'POST',
      json: { a: 1 },
      headers: { authorization: 'Bearer t' },
    })
    const [, init] = fetchMock.mock.calls[0]!
    expect(init.headers['x-device-id']).toMatch(/^[0-9a-f-]{36}$/)
    expect(init.headers['content-type']).toBe('application/json')
    expect(init.headers.authorization).toBe('Bearer t')
    expect(init.body).toBe('{"a":1}')
    expect(init.method).toBe('POST')
  })

  it('sends FormData untouched', async () => {
    const fetchMock = respond({ ok: true, data: null, error: null })
    setFetch(fetchMock)
    const form = new FormData()
    form.set('a', 'b')
    await apiRequest('/api/x', z.null(), { method: 'POST', form })
    const [, init] = fetchMock.mock.calls[0]!
    expect(init.body).toBe(form)
    expect(init.headers['content-type']).toBeUndefined()
  })

  it('maps network failures to network_error', async () => {
    setFetch(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(apiRequest('/api/x', z.unknown())).rejects.toMatchObject({ code: 'network_error' })
  })

  it('rethrows aborts', async () => {
    setFetch(vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')))
    await expect(apiRequest('/api/x', z.unknown())).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('reports non-JSON responses', async () => {
    setFetch(respond('<html>502</html>', 502))
    await expect(apiRequest('/api/x', z.unknown())).rejects.toMatchObject({
      code: 'bad_response',
      status: 502,
    })
  })

  it('reports JSON that is not an envelope', async () => {
    setFetch(respond({ hello: 'world' }))
    await expect(apiRequest('/api/x', z.unknown())).rejects.toMatchObject({ code: 'bad_response' })
  })
})

describe('errorMessage', () => {
  it('shows minutes for long rate limit waits', () => {
    expect(errorMessage(new ApiError(429, 'rate_limited', '多すぎ', 600))).toBe(
      '多すぎ（あと約 10 分）',
    )
    expect(errorMessage(new ApiError(429, 'rate_limited', '多すぎ'))).toBe('多すぎ')
  })

  it('falls back for unknown values', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
    expect(errorMessage('x')).toBe('エラーが発生しました')
  })
})
