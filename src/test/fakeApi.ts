import { setFetch } from '../api/client'

export type FakeRoute = {
  method?: string
  path: string | RegExp
  status?: number
  body: unknown | ((req: { url: string; init: RequestInit }) => unknown)
}

export const ok = (data: unknown, meta?: unknown) => ({
  ok: true,
  data,
  error: null,
  ...(meta ? { meta } : {}),
})
export const fail = (code: string, message: string) => ({
  ok: false,
  data: null,
  error: { code, message },
})

/** URL とメソッドで応答を返す fetch を仕込む。呼び出し履歴を返す */
export function installFakeApi(routes: FakeRoute[]) {
  const calls: { url: string; init: RequestInit }[] = []
  const impl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input)
    calls.push({ url, init })
    const method = init.method ?? 'GET'
    const route = routes.find(
      (r) =>
        (r.method ?? 'GET') === method &&
        (typeof r.path === 'string' ? url === r.path : r.path.test(url)),
    )
    if (!route)
      return new Response(JSON.stringify(fail('not_found', `no fake for ${method} ${url}`)), {
        status: 404,
      })
    const body =
      typeof route.body === 'function'
        ? (route.body as (r: { url: string; init: RequestInit }) => unknown)({ url, init })
        : route.body
    return new Response(JSON.stringify(body), { status: route.status ?? 200 })
  })
  setFetch(impl as typeof fetch)
  return { calls, impl }
}

export const TOPIC = {
  id: '10000000-0000-4000-8000-000000000001',
  slug: 'seiyu',
  title: 'ネット声優',
  description: '台詞に声を当てよう',
  scriptText: '「ここは任せて先に行け！」',
  sortOrder: 0,
  isClosed: false,
  mode: 'board',
  publishOn: 'immediately',
  ownerName: null,
  threadCount: 1,
  createdAt: '2026-09-18T12:00:00.000Z',
}

export const THREAD = {
  id: '20000000-0000-4000-8000-000000000001',
  topicId: TOPIC.id,
  topicSlug: TOPIC.slug,
  title: '最初の声',
  postCount: 2,
  lastPostAt: '2026-09-18T12:00:00.000Z',
  createdAt: '2026-09-18T12:00:00.000Z',
}

export function makePost(seq: number, patch: Record<string, unknown> = {}) {
  return {
    id: `30000000-0000-4000-8000-00000000000${seq}`,
    threadId: THREAD.id,
    seq,
    parentPostId: null,
    parentSeq: null,
    title: seq === 1 ? '最初の声' : null,
    authorName: seq === 1 ? 'たろう' : null,
    durationMs: 1500,
    status: 'ready',
    audioUrl: `/audio/public/2026/09/p${seq}.m4a`,
    reviewStatus: null,
    airedAt: null,
    airedRef: null,
    createdAt: '2026-09-18T12:00:00.000Z',
    ...patch,
  }
}
