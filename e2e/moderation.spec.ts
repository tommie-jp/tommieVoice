import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { E2E_ADMIN_TOKEN, E2E_API_PORT } from './env.ts'
import { createTopic } from './helpers/admin.ts'

const FIXTURE = readFileSync(
  path.resolve(import.meta.dirname, '../server/test/fixtures/sample.webm'),
)

test('a reported post can be hidden from the admin page', async ({ page, request }) => {
  const topic = await createTopic(request, { title: 'E2E 通報' })
  const api = `http://127.0.0.1:${E2E_API_PORT}`
  const created = await (
    await request.post(`${api}/api/topics/${topic.slug}/threads`, {
      headers: { 'x-device-id': randomUUID() },
      multipart: {
        title: '通報される声',
        durationMs: '1000',
        audio: { name: 'v.webm', mimeType: 'audio/webm', buffer: FIXTURE },
      },
    })
  ).json()
  const threadId = created.data.thread.id

  // 閲覧者が通報する
  await page.goto(`/threads/${threadId}`)
  await page.getByRole('button', { name: '#1 を通報' }).click()
  const sheet = page.getByRole('dialog', { name: '#1 を通報' })
  await sheet.getByLabel('宣伝・スパム').check()
  await sheet.getByRole('button', { name: '通報する' }).click()
  await expect(page.getByRole('status')).toContainText('通報しました')

  // 管理者が非表示にする
  await page.goto('/admin')
  await page.getByLabel('管理トークン').fill(E2E_ADMIN_TOKEN)
  await page.getByRole('button', { name: '使う' }).click()
  const row = page.getByRole('listitem', { name: '通報される声 #1 の通報' })
  await expect(row).toContainText('宣伝・スパム ×1')
  await row.getByRole('button', { name: '非表示' }).click()
  await expect(row).toBeHidden()

  // 一般の画面から消える
  await page.goto(`/threads/${threadId}`)
  await expect(page.getByText('スレッドが見つかりません')).toBeVisible()
})
