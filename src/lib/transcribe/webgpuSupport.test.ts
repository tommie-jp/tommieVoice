import { detectWebGpu } from './webgpuSupport'

const nav = (gpu: unknown) => ({ gpu }) as unknown as Navigator

describe('detectWebGpu', () => {
  it('returns unsupported when navigator.gpu is undefined', async () => {
    await expect(detectWebGpu(nav(undefined))).resolves.toMatchObject({ supported: false })
  })

  it('reports missing adapters and init errors', async () => {
    await expect(detectWebGpu(nav({ requestAdapter: async () => null }))).resolves.toMatchObject({
      supported: false,
      reason: 'GPU が見つかりませんでした',
    })
    await expect(
      detectWebGpu(nav({ requestAdapter: () => Promise.reject(new Error('x')) })),
    ).resolves.toMatchObject({ supported: false, reason: 'GPU の初期化に失敗しました' })
  })

  it('accepts a working adapter', async () => {
    await expect(detectWebGpu(nav({ requestAdapter: async () => ({}) }))).resolves.toEqual({
      supported: true,
    })
  })
})
