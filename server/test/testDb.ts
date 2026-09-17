// テスト用 DB の接続先。ローカルは compose.override.yml の開発用 DB（127.0.0.1:5436）。
// CI は TEST_DATABASE_URL で上書きする。
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://tommievoice:tommievoice-dev@127.0.0.1:5436/tommievoice_test'

export function adminUrlFor(url: string): string {
  const u = new URL(url)
  u.pathname = '/postgres'
  return u.toString()
}

export function databaseNameOf(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
}
