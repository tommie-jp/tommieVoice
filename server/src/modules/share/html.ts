// 共有 URL 用の最小 HTML。OGP を載せ、人間はすぐ SPA へ移動させる。

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c]!)
}

export type SharePage = {
  title: string
  description: string
  /** 移動先（同一オリジンの相対パスのみ） */
  path: string
  origin: string
  audioUrl?: string | null
}

const SITE = 'tommieVoice'
const DESCRIPTION_MAX = 140

export function truncate(text: string, max: number = DESCRIPTION_MAX): string {
  const chars = [...text]
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`
}

export function renderSharePage(page: SharePage): string {
  if (!page.path.startsWith('/') || page.path.startsWith('//'))
    throw new Error('invalid share path')
  const url = `${page.origin}${page.path}`
  const title = escapeHtml(`${page.title} | ${SITE}`)
  const description = escapeHtml(truncate(page.description))
  const target = escapeHtml(page.path)
  const audio = page.audioUrl
    ? `<meta property="og:audio" content="${escapeHtml(`${page.origin}${page.audioUrl}`)}">\n<meta property="og:audio:type" content="audio/mp4">\n`
    : ''
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${escapeHtml(url)}">
${audio}<meta name="twitter:card" content="summary">
<meta http-equiv="refresh" content="0; url=${target}">
<link rel="canonical" href="${escapeHtml(url)}">
</head>
<body>
<p><a href="${target}">${title}</a></p>
</body>
</html>
`
}
