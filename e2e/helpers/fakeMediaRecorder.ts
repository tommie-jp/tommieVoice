import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'

const FIXTURE = path.resolve(import.meta.dirname, '../../server/test/fixtures/sample.webm')

/**
 * ヘッドレスブラウザにはマイクが無いので、getUserMedia と MediaRecorder を差し替える。
 * 停止すると fixture の音声（padBytes 指定時は後ろに 0 を足したもの）を Blob として返す。
 */
export async function installFakeRecorder(page: Page, opts: { padBytes?: number } = {}) {
  const base64 = readFileSync(FIXTURE).toString('base64')
  await page.addInitScript(
    ({ base64, padBytes }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      const mediaDevices = {
        getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }),
      }
      Object.defineProperty(navigator, 'mediaDevices', { value: mediaDevices, configurable: true })
      class FakeMediaRecorder {
        static isTypeSupported(t: string) {
          return t.startsWith('audio/webm')
        }
        mimeType = 'audio/webm;codecs=opus'
        state = 'inactive'
        ondataavailable: ((e: { data: Blob }) => void) | null = null
        onstop: (() => void) | null = null
        start() {
          this.state = 'recording'
        }
        stop() {
          this.state = 'inactive'
          const parts: BlobPart[] = [bytes]
          if (padBytes > 0) parts.push(new Uint8Array(padBytes))
          this.ondataavailable?.({ data: new Blob(parts, { type: this.mimeType }) })
          setTimeout(() => this.onstop?.(), 0)
        }
      }
      ;(window as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeMediaRecorder
    },
    { base64, padBytes: opts.padBytes ?? 0 },
  )
}
