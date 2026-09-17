import { randomUUID } from 'node:crypto'
import type { APIRequestContext } from '@playwright/test'
import { E2E_ADMIN_TOKEN, E2E_API_PORT } from '../env.ts'

export async function createTopic(
  request: APIRequestContext,
  data: { title: string; scriptText?: string; description?: string },
): Promise<{ slug: string; id: string }> {
  const slug = `e2e-${randomUUID().slice(0, 8)}`
  const res = await request.post(`http://127.0.0.1:${E2E_API_PORT}/api/admin/topics`, {
    headers: { authorization: `Bearer ${E2E_ADMIN_TOKEN}` },
    data: { slug, sortOrder: -1000, ...data },
  })
  if (res.status() !== 201) throw new Error(`createTopic: ${res.status()} ${await res.text()}`)
  return (await res.json()).data
}

export async function createStreamerWithInbox(request: APIRequestContext, name: string) {
  const headers = { authorization: `Bearer ${E2E_ADMIN_TOKEN}` }
  const res = await request.post(`http://127.0.0.1:${E2E_API_PORT}/api/admin/streamers`, {
    headers,
    data: { displayName: name },
  })
  if (res.status() !== 201) throw new Error(`createStreamer: ${res.status()} ${await res.text()}`)
  const { streamer, loginKey } = (await res.json()).data
  const slug = `inbox-${randomUUID().slice(0, 8)}`
  const topicRes = await request.post(`http://127.0.0.1:${E2E_API_PORT}/api/admin/topics`, {
    headers,
    data: {
      slug,
      title: `${name}の凸待ち箱`,
      mode: 'inbox',
      ownerId: streamer.id,
      sortOrder: -2000,
    },
  })
  if (topicRes.status() !== 201)
    throw new Error(`createInbox: ${topicRes.status()} ${await topicRes.text()}`)
  return { streamerId: streamer.id as string, loginKey: loginKey as string, slug }
}
