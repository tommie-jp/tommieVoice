import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fakeJob, fakeTranscribeDeps } from '../../test/fakeTranscribe'
import { TranscriptionPanel } from './TranscriptionPanel'

const STATUS = { waiting: 2, leased: 0, failed: 0, lastWorkerSeenAt: null }

describe('TranscriptionPanel', () => {
  beforeEach(() => localStorage.clear())

  it('explains when WebGPU is unavailable and hides the run button', async () => {
    const { deps } = fakeTranscribeDeps({ supported: false })
    render(<TranscriptionPanel status={STATUS} onDone={vi.fn()} deps={deps} />)
    expect(await screen.findByText('WebGPU がありません')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '文字起こしを実行' })).not.toBeInTheDocument()
    expect(screen.getByText('ワーカー最終接続: まだありません')).toBeInTheDocument()
  })

  it('loads the model, processes all jobs and reports completion', async () => {
    const { deps, api, created } = fakeTranscribeDeps({ jobs: [fakeJob(1), fakeJob(2)] })
    const onDone = vi.fn()
    const user = userEvent.setup()
    render(<TranscriptionPanel status={STATUS} onDone={onDone} deps={deps} />)
    await user.click(await screen.findByRole('button', { name: '文字起こしを実行' }))
    expect(
      await screen.findByText('待ちの声をすべて文字起こししました（成功 2 件・失敗 0 件）'),
    ).toBeInTheDocument()
    expect(onDone).toHaveBeenCalledOnce()
    expect(api.submitted).toHaveLength(2)
    expect(api.claim).toHaveBeenCalledWith(expect.stringMatching(/^browser-[0-9a-f]{8}$/))
    expect(created).toEqual(['quality'])
    // 2 回目はモデルを使い回す
    await user.click(screen.getByRole('button', { name: '文字起こしを実行' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(2))
    expect(created).toEqual(['quality'])
  })

  it('switches profile, remembers it and recreates the transcriber', async () => {
    const { deps, created, disposed } = fakeTranscribeDeps()
    const user = userEvent.setup()
    render(<TranscriptionPanel status={STATUS} onDone={vi.fn()} deps={deps} />)
    await user.click(await screen.findByRole('button', { name: '文字起こしを実行' }))
    await screen.findByText(/文字起こししました/)
    await user.selectOptions(screen.getByLabelText('文字起こしのモード'), 'light')
    expect(localStorage.getItem('tv.transcribeProfile')).toBe('light')
    await user.click(screen.getByRole('button', { name: '文字起こしを実行' }))
    await waitFor(() => expect(created).toEqual(['quality', 'light']))
    expect(disposed).toHaveLength(1)
  })

  it('shows load failures and can be aborted while running', async () => {
    const failing = fakeTranscribeDeps({ loadError: new Error('WebGPU device lost') })
    const user = userEvent.setup()
    const { unmount } = render(
      <TranscriptionPanel status={STATUS} onDone={vi.fn()} deps={failing.deps} />,
    )
    await user.click(await screen.findByRole('button', { name: '文字起こしを実行' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('WebGPU device lost')
    unmount()

    let release!: () => void
    const slow = fakeTranscribeDeps({
      jobs: [fakeJob(1), fakeJob(2)],
      transcribe: () => new Promise((r) => (release = () => r({ text: 'x' }))),
    })
    render(<TranscriptionPanel status={null} onDone={vi.fn()} deps={slow.deps} />)
    await user.click(await screen.findByRole('button', { name: '文字起こしを実行' }))
    expect(await screen.findByText(/文字起こし中… 完了 0 件/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '中止' }))
    release()
    expect(await screen.findByText('中止しました（成功 1 件・失敗 0 件）')).toBeInTheDocument()
  })

  it('stops after repeated failures with guidance', async () => {
    const { deps, api } = fakeTranscribeDeps({
      jobs: [fakeJob(1), fakeJob(2), fakeJob(3)],
      transcribe: () => Promise.reject(new Error('oom')),
    })
    const user = userEvent.setup()
    render(
      <TranscriptionPanel
        status={{ ...STATUS, leased: 1, failed: 2 }}
        onDone={vi.fn()}
        deps={deps}
      />,
    )
    expect(screen.getByText(/処理中 1 件 ・ 失敗 2 件/)).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: '文字起こしを実行' }))
    expect(await screen.findByText(/3 件続けて失敗したので止めました/)).toBeInTheDocument()
    expect(api.fail).toHaveBeenCalledTimes(3)
  })
})
