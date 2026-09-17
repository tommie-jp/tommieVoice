import { expect, test } from '@playwright/test'
import { createStreamerWithInbox } from './helpers/admin.ts'
import { installFakeRecorder } from './helpers/fakeMediaRecorder.ts'

test('viewer sends a voice to an inbox, streamer approves and airs it, then it becomes public', async ({
  page,
  browser,
  request,
}) => {
  const { loginKey, slug } = await createStreamerWithInbox(request, 'E2E配信者')

  // 視聴者が凸待ち箱に声を届ける
  await installFakeRecorder(page)
  await page.goto(`/t/${slug}`)
  await expect(page.getByText(/E2E配信者さんの凸待ち箱です/)).toBeVisible()
  await page.getByRole('button', { name: '🎙 声を届ける' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('タイトル').fill('配信で読んでほしい')
  await sheet.getByRole('button', { name: '録音' }).click()
  await sheet.getByRole('button', { name: '停止' }).click()
  await sheet.getByRole('button', { name: '投稿する' }).click()
  await expect(page.getByRole('status')).toContainText('受け付けました')

  // 一般には見えない
  await page.reload()
  await expect(page.getByText('まだ投稿がありません。最初の声を届けよう')).toBeVisible()
  await page.goto('/mine')
  await expect(page.getByText('受付済み（配信者の確認待ち）')).toBeVisible()

  // 配信者がログインして採用 → 今流す
  const streamerContext = await browser.newContext({ ...test.info().project.use })
  const streamerPage = await streamerContext.newPage()
  await streamerPage.goto('/streamer/login')
  await streamerPage.getByLabel(/ログインキー/).fill(loginKey)
  await streamerPage.getByRole('button', { name: 'ログイン' }).click()
  await expect(streamerPage.getByRole('heading', { name: 'E2E配信者 の凸待ち箱' })).toBeVisible()
  const row = streamerPage.getByRole('listitem', { name: '配信で読んでほしい' })
  await expect(row).toContainText('文字起こし待ち')
  await row.getByRole('button', { name: '採用' }).click()
  await expect(row).toBeHidden()
  await streamerPage.getByRole('tab', { name: /^採用/ }).click()
  await streamerPage
    .getByRole('listitem', { name: '配信で読んでほしい' })
    .getByRole('button', { name: '今流す' })
    .click()
  await streamerPage.getByRole('tab', { name: /^配信済み/ }).click()
  await expect(streamerPage.getByRole('listitem', { name: '配信で読んでほしい' })).toBeVisible()
  await streamerContext.close()

  // 公開され、バッジが付く
  await page.goto(`/t/${slug}`)
  await page.getByRole('link', { name: /配信で読んでほしい/ }).click()
  await expect(page.getByText('📺 配信で紹介されました')).toBeVisible()
  await page.goto('/mine')
  await expect(page.getByText('📺 配信で紹介されました')).toBeVisible()
})
