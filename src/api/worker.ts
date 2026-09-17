import { CSRF_HEADER, CSRF_HEADER_VALUE, DEVICE_ID_HEADER } from '../../shared/constants.ts'
import { workerJobSchema, type WorkerJob } from '../../shared/schemas/transcript.ts'
import { getDeviceId } from '../lib/deviceId'
import type { JobApi } from '../lib/transcribe/runner'
import { ApiError, apiRequest } from './client'
import { z } from 'zod'

const csrf = { [CSRF_HEADER]: CSRF_HEADER_VALUE }
const lease = (job: WorkerJob) => ({ ...csrf, 'x-lease-token': job.leaseToken })

/** 配信者セッションで文字起こしジョブを扱う API */
export const streamerJobApi: JobApi = {
  async claim(workerId) {
    let res: Response
    try {
      res = await fetch('/api/worker/jobs/claim', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { ...csrf, 'content-type': 'application/json', [DEVICE_ID_HEADER]: getDeviceId() },
        body: JSON.stringify({ workerId }),
      })
    } catch {
      throw new ApiError(0, 'network_error', '通信できませんでした')
    }
    if (res.status === 204) return null
    const body: unknown = await res.json().catch(() => null)
    const parsed = z.object({ ok: z.literal(true), data: workerJobSchema }).safeParse(body)
    if (!parsed.success)
      throw new ApiError(res.status, 'claim_failed', 'ジョブを取得できませんでした')
    return parsed.data.data
  },
  async fetchAudio(job) {
    const res = await fetch(job.audioPath, { credentials: 'same-origin', headers: lease(job) })
    if (!res.ok) throw new ApiError(res.status, 'audio_unavailable', '音声を取得できませんでした')
    return res.blob()
  },
  async submit(job, result) {
    await apiRequest(`/api/worker/jobs/${job.id}/result`, z.unknown(), {
      method: 'POST',
      json: result,
      headers: lease(job),
    })
  },
  async fail(job, error) {
    await apiRequest(`/api/worker/jobs/${job.id}/fail`, z.unknown(), {
      method: 'POST',
      json: { error: error.slice(0, 2000) },
      headers: lease(job),
    })
  },
}
