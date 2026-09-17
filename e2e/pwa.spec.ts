import { expect, test } from '@playwright/test'

// PWA の manifest と Service Worker は本番ビルドにだけ含まれるので、dist を検査する
test('manifest is built and links icons', async ({ request }) => {
  test.skip(!process.env.E2E_CHECK_DIST, 'npm run build 後に E2E_CHECK_DIST=1 で実行する')
  const { readFileSync, existsSync } = await import('node:fs')
  const manifest = JSON.parse(readFileSync('dist/manifest.webmanifest', 'utf8'))
  expect(manifest).toMatchObject({ short_name: 'tommieVoice', display: 'standalone', lang: 'ja' })
  for (const icon of manifest.icons) expect(existsSync(`dist${icon.src}`)).toBe(true)
  expect(existsSync('dist/sw.js')).toBe(true)
  expect(request).toBeTruthy()
})
