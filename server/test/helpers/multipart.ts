import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures')

export function fixture(name: string): Buffer {
  return readFileSync(path.join(FIXTURES, name))
}

export function fixturePath(name: string): string {
  return path.join(FIXTURES, name)
}

export type FilePart = { field?: string; filename?: string; contentType?: string; data: Buffer }

/** light-my-request に渡す multipart/form-data の本体を組み立てる */
export function multipart(
  fields: Record<string, string>,
  file?: FilePart,
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = `----tv${randomUUID()}`
  const chunks: Buffer[] = []
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    )
  }
  if (file) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.field ?? 'audio'}"; filename="${file.filename ?? 'voice.webm'}"\r\nContent-Type: ${file.contentType ?? 'audio/webm'}\r\n\r\n`,
      ),
      file.data,
      Buffer.from('\r\n'),
    )
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  }
}
