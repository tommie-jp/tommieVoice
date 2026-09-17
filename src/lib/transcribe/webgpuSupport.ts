export type WebGpuSupport = { supported: true } | { supported: false; reason: string }

type GpuNavigator = Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }

/** WebGPU が実際に使えるか（アダプタが取れるか）を調べる */
export async function detectWebGpu(nav: Navigator = navigator): Promise<WebGpuSupport> {
  const gpu = (nav as GpuNavigator).gpu
  if (!gpu) {
    return {
      supported: false,
      reason: 'このブラウザは WebGPU に対応していません（PC の Chrome / Edge を使ってください）',
    }
  }
  try {
    const adapter = await gpu.requestAdapter()
    if (!adapter) return { supported: false, reason: 'GPU が見つかりませんでした' }
    return { supported: true }
  } catch {
    return { supported: false, reason: 'GPU の初期化に失敗しました' }
  }
}
