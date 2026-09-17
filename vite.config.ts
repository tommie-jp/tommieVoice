import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { ortAssets } from './vite/ortAssets.ts'

const API_ORIGIN = process.env.VITE_API_PROXY ?? 'http://127.0.0.1:3100'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    ortAssets(import.meta.dirname),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'tommieVoice - 音声掲示板',
        short_name: 'tommieVoice',
        description: '声で書き込む掲示板',
        lang: 'ja',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f5f5f7',
        theme_color: '#ff3b30',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // アプリシェルだけを precache する。音声と API はキャッシュしない
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // 文字起こし用の大きなファイルは precache しない
        globIgnores: ['ort/**', 'assets/transcribeWorker-*.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/audio\//, /^\/s\//],
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    // WSL2（NAT モード）では 127.0.0.1 だけで待ち受けると Windows の localhost から届かないため
    host: '0.0.0.0',
    proxy: {
      '/api': API_ORIGIN,
      '/audio': API_ORIGIN,
      '/s/': API_ORIGIN,
    },
  },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'server/src/**/*.ts', 'shared/**/*.ts'],
      exclude: [
        '**/*.test.{ts,tsx}',
        'src/main.tsx',
        'src/test/**',
        'server/src/main.ts',
        'server/src/worker/main.ts',
        'server/src/worker/runtime.ts',
        'server/src/db/migrate.ts',
        'src/lib/transcribe/transcribeWorker.ts',
        '**/*.d.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'web',
          globals: true,
          environment: 'jsdom',
          setupFiles: './src/test/setup.ts',
          css: true,
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
      {
        test: {
          name: 'server',
          globals: true,
          environment: 'node',
          include: ['server/**/*.test.ts', 'shared/**/*.test.ts'],
          globalSetup: './server/test/globalSetup.ts',
          setupFiles: './server/test/setupEnv.ts',
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
})
