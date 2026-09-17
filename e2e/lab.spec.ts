import { expect, test } from '@playwright/test'

// ヘッドレスでは WebGPU が使えないので、案内が出て壊れないことだけを確認する（実測は実機の Chrome で行う）
test('transcribe lab page loads and explains WebGPU availability', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  await page.goto('/lab/transcribe')
  await expect(page.getByRole('heading', { name: '文字起こし計測' })).toBeVisible()
  await expect(page.getByLabel('モード')).toBeVisible()
  const ort = await page.request.get('/ort/ort-wasm-simd-threaded.jsep.mjs')
  expect(ort.status()).toBe(200)
  expect(ort.headers()['content-type']).toContain('javascript')
  expect(errors).toEqual([])
})
