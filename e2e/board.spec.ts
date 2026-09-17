import { expect, test, type Page } from '@playwright/test'
import { createTopic } from './helpers/admin.ts'
import { installFakeRecorder } from './helpers/fakeMediaRecorder.ts'

async function recordInSheet(page: Page) {
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '録音' }).click()
  await dialog.getByRole('button', { name: '停止' }).click()
  await expect(dialog.getByRole('button', { name: '録り直す' })).toBeVisible()
  return dialog
}

test('topic list shows admin-created topic', async ({ page, request }) => {
  const topic = await createTopic(request, { title: 'E2E 一覧の話題', description: '説明文' })
  await page.goto('/')
  const card = page.locator(`a[href="/t/${topic.slug}"]`)
  await expect(card).toBeVisible()
  await expect(card).toContainText('E2E 一覧の話題')
  await expect(card).toContainText('説明文')
})

test('visitor records, previews and posts a new thread, then another visitor replies', async ({
  page,
  browser,
  request,
}) => {
  const topic = await createTopic(request, { title: 'E2E 声劇', scriptText: '「待たせたな」' })
  await installFakeRecorder(page)
  await page.goto(`/t/${topic.slug}`)
  await expect(page.getByText('「待たせたな」')).toBeVisible()

  await page.getByRole('button', { name: /声でスレッドを立てる/ }).click()
  const dialog = await recordInSheet(page)
  await dialog.getByLabel('タイトル').fill('決め台詞やってみた')
  await dialog.getByLabel('名前（任意）').fill('はじめ')
  await dialog.getByRole('button', { name: '投稿する' }).click()

  await expect(page).toHaveURL(/\/threads\//)
  await expect(page.getByRole('heading', { name: '決め台詞やってみた' })).toBeVisible()
  await expect(page.getByRole('button', { name: '#1 を再生' })).toBeEnabled()
  const threadUrl = page.url()

  // 別の端末（別コンテキスト）から #1 に返事する
  const other = await browser.newContext({ ...test.info().project.use })
  const page2 = await other.newPage()
  await installFakeRecorder(page2)
  await page2.goto(threadUrl)
  await page2.getByRole('button', { name: '返事する' }).first().click()
  const replyDialog = await recordInSheet(page2)
  await replyDialog.getByRole('button', { name: '投稿する' }).click()
  await expect(page2.getByRole('status')).toContainText('投稿しました #2')
  await expect(page2.getByRole('button', { name: '>>1' })).toBeVisible()
  await other.close()

  await page.reload()
  await expect(page.getByRole('button', { name: '#2 を再生' })).toBeEnabled()
  await page.getByRole('button', { name: '#1 を再生' }).click()
  await expect(page.getByRole('region', { name: '再生中' })).toContainText('#1 はじめ')
})

test('upload over limit shows friendly error', async ({ page, request }) => {
  const topic = await createTopic(request, { title: 'E2E 大きすぎ' })
  await installFakeRecorder(page, { padBytes: 9 * 1024 * 1024 })
  await page.goto(`/t/${topic.slug}`)
  await page.getByRole('button', { name: /声でスレッドを立てる/ }).click()
  const dialog = await recordInSheet(page)
  await dialog.getByLabel('タイトル').fill('長すぎる')
  await dialog.getByRole('button', { name: '投稿する' }).click()
  await expect(dialog.getByRole('alert')).toContainText('ファイルが大きすぎます')
})
