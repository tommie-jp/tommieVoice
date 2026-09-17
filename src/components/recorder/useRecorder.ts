import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_RECORDING_MS } from '../../../shared/constants.ts'
import type { RecordedAudio } from '../../api/board'
import { AudioRecorder, type RecordingResult } from '../../lib/audioRecorder'

export type RecorderLike = {
  start(): Promise<void>
  stop(): Promise<RecordingResult>
  cancel(): void
}

export type RecorderStatus = 'idle' | 'starting' | 'recording' | 'stopping' | 'recorded'

export type RecorderApi = {
  status: RecorderStatus
  elapsedMs: number
  recorded: (RecordedAudio & { url: string }) | null
  error: string | null
  start(): Promise<void>
  stop(): Promise<void>
  reset(): void
}

const TICK_MS = 200

export function useRecorder(
  createRecorder: () => RecorderLike = () => new AudioRecorder(),
  maxDurationMs: number = MAX_RECORDING_MS,
): RecorderApi {
  const recorderRef = useRef<RecorderLike | null>(null)
  const startedAtRef = useRef(0)
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [recorded, setRecorded] = useState<RecorderApi['recorded']>(null)
  const [error, setError] = useState<string | null>(null)

  recorderRef.current ??= createRecorder()

  const stop = useCallback(async () => {
    const recorder = recorderRef.current
    if (!recorder) return
    setStatus('stopping')
    try {
      const result = await recorder.stop()
      const url = URL.createObjectURL(result.blob)
      setRecorded({ ...result, durationMs: Math.min(result.durationMs, maxDurationMs), url })
      setStatus('recorded')
    } catch (e) {
      setError(e instanceof Error ? e.message : '録音の停止に失敗しました')
      setStatus('idle')
    }
  }, [maxDurationMs])

  const start = useCallback(async () => {
    const recorder = recorderRef.current
    if (!recorder) return
    setError(null)
    setStatus('starting')
    try {
      await recorder.start()
      startedAtRef.current = Date.now()
      setElapsedMs(0)
      setStatus('recording')
    } catch (e) {
      setError(e instanceof Error ? e.message : '録音を開始できませんでした')
      setStatus('idle')
    }
  }, [])

  const reset = useCallback(() => {
    // Blob URL の解放は下の [recorded] effect が行う
    setRecorded(null)
    setElapsedMs(0)
    setError(null)
    setStatus('idle')
  }, [])

  // 経過時間の更新と上限での自動停止
  useEffect(() => {
    if (status !== 'recording') return
    const id = window.setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current
      setElapsedMs(Math.min(elapsed, maxDurationMs))
      if (elapsed >= maxDurationMs) void stop()
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [status, maxDurationMs, stop])

  // 画面を離れたら録音を止め、Blob URL を解放する
  useEffect(() => {
    const recorder = recorderRef.current
    return () => recorder?.cancel()
  }, [])
  useEffect(() => {
    const url = recorded?.url
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [recorded])

  return { status, elapsedMs, recorded, error, start, stop, reset }
}
