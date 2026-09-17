import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { E2E_API_PORT } from './env.ts'
import { createStreamerWithInbox } from './helpers/admin.ts'

const FIXTURE = readFileSync(
  path.resolve(import.meta.dirname, '../server/test/fixtures/sample.webm'),
)

test('air from dashboard triggers play event on overlay page', async ({
  browser,
  request,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'オーバーレイは OBS（Chromium）で使う')
  const { loginKey, slug } = await createStreamerWithInbox(request, 'OBS配信者')
  await request.post(`http://127.0.0.1:${E2E_API_PORT}/api/topics/${slug}/threads`, {
    headers: { 'x-device-id': randomUUID() },
    multipart: {
      title: 'OBSで流す声',
      authorName: 'はるか',
      durationMs: '1000',
      audio: { name: 'v.webm', mimeType: 'audio/webm', buffer: FIXTURE },
    },
  })

  // 配信者: ログインして URL を発行し、声を採用する
  const dashboard = await browser.newPage()
  await dashboard.goto('/streamer/login')
  await dashboard.getByLabel(/ログインキー/).fill(loginKey)
  await dashboard.getByRole('button', { name: 'ログイン' }).click()
  await dashboard.getByRole('button', { name: 'URL を発行' }).click()
  const url = await dashboard.locator('.key-text').innerText()
  await dashboard
    .getByRole('listitem', { name: 'OBSで流す声' })
    .getByRole('button', { name: '採用' })
    .click()

  // OBS 側: オーバーレイを開く
  const overlay = await browser.newPage()
  await overlay.goto(new URL(url).pathname)
  await expect(overlay.getByText('● OBS配信者')).toBeVisible()
  await dashboard.reload()
  await expect(dashboard.getByText('接続中 1')).toBeVisible()

  // 配信者: 次を流す → オーバーレイに表示される
  await dashboard.getByRole('button', { name: '次を流す' }).click()
  await expect(overlay.getByRole('status')).toContainText('はるか')
  await expect(overlay.getByRole('status')).toContainText('OBSで流す声')
  await dashboard.getByRole('button', { name: '停止' }).click()
  await expect(overlay.getByRole('status')).toBeHidden()
})
