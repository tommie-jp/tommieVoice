import { createReadStream, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

// Transformers.js が読み込む ONNX Runtime Web の wasm を /ort/ で自前配信する
export const ORT_FILES = [
  'ort-wasm-simd-threaded.jsep.mjs',
  'ort-wasm-simd-threaded.jsep.wasm',
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
] as const

const MIME: Readonly<Record<string, string>> = {
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm',
}

export function ortAssets(root: string): Plugin {
  const dir = path.resolve(root, 'node_modules/onnxruntime-web/dist')
  return {
    name: 'tommievoice-ort-assets',
    configureServer(server) {
      server.middlewares.use('/ort/', (req, res, next) => {
        const name = (req.url ?? '').replace(/^\//, '').split('?')[0] ?? ''
        if (!(ORT_FILES as readonly string[]).includes(name)) return next()
        res.setHeader('content-type', MIME[path.extname(name)] ?? 'application/octet-stream')
        createReadStream(path.join(dir, name)).pipe(res)
      })
    },
    generateBundle() {
      for (const name of ORT_FILES) {
        this.emitFile({
          type: 'asset',
          fileName: `ort/${name}`,
          source: readFileSync(path.join(dir, name)),
        })
      }
    },
  }
}
