import { expect, test } from '@playwright/test'
import { createTopic } from './helpers/admin.ts'
import { installFakeRecorder } from './helpers/fakeMediaRecorder.ts'
import { E2E_API_PORT } from './env.ts'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const FIXTURE = readFileSync(
  path.resolve(import.meta.dirname, '../server/test/fixtures/sample.webm'),
)

// 実際の音声デコードが要るので Opus を再生できる Chromium でのみ確認する
test('posts in a thread play in sequence', async ({ page, request, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebKit (Linux) は Opus/WebM を再生できない')
  const topic = await createTopic(request, { title: 'E2E 連続再生' })
  const api = `http://127.0.0.1:${E2E_API_PORT}`
  const upload = (url: string, fields: Record<string, string>) =>
    request.post(url, {
      headers: { 'x-device-id': randomUUID() },
      multipart: {
        ...fields,
        durationMs: '1000',
        audio: { name: 'v.webm', mimeType: 'audio/webm', buffer: FIXTURE },
      },
    })
  const created = await (
    await upload(`${api}/api/topics/${topic.slug}/threads`, { title: '連続' })
  ).json()
  await upload(`${api}/api/threads/${created.data.thread.id}/posts`, { authorName: 'ふたり目' })

  await installFakeRecorder(page)
  await page.goto(`/threads/${created.data.thread.id}`)
  await page.getByRole('button', { name: '#1 を再生' }).click()
  const bar = page.getByRole('region', { name: '再生中' })
  await expect(bar).toContainText('#1')
  await expect(bar).toContainText('#2 ふたり目', { timeout: 10_000 })
})
