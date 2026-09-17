import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { fakeTranscribeDeps } from '../../test/fakeTranscribe'
import { TranscribeLabPage } from './TranscribeLabPage'

function renderLab(deps: ReturnType<typeof fakeTranscribeDeps>['deps'], stepMs = 1000) {
  let t = 0
  return render(
    <MemoryRouter>
      <TranscribeLabPage deps={deps} now={() => (t += stepMs)} />
    </MemoryRouter>,
  )
}

describe('TranscribeLabPage', () => {
  it('shows unsupported message when webgpu is missing', async () => {
    const { deps } = fakeTranscribeDeps({ supported: false })
    renderLab(deps)
    expect(await screen.findByRole('alert')).toHaveTextContent('WebGPU がありません')
    expect(screen.getByRole('button', { name: '計測する' })).toBeDisabled()
  })

  it('lists files with pending status after drop and measures them', async () => {
    let calls = 0
    const { deps, created } = fakeTranscribeDeps({
      transcribe: async () => {
        calls += 1
        if (calls === 2) throw new Error('decode error')
        return { text: '計測テキスト' }
      },
    })
    const user = userEvent.setup()
    renderLab(deps)
    await screen.findByRole('button', { name: '計測する' })
    await user.selectOptions(screen.getByLabelText('モード'), 'light')
    const files = [
      new File(['a'], 'one.m4a', { type: 'audio/mp4' }),
      new File(['b'], 'two.m4a', { type: 'audio/mp4' }),
    ]
    await user.upload(screen.getByLabelText('音声ファイル（複数可）'), files)
    expect(screen.getAllByText('pending')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: '計測する' }))
    const table = await screen.findByRole('table')
    expect(await within(table).findByText('計測テキスト')).toBeInTheDocument()
    expect(within(table).getByText('失敗: decode error')).toBeInTheDocument()
    expect(within(table).getByText('0:06')).toBeInTheDocument()
    expect(created).toEqual(['light'])
    expect(screen.getByRole('status')).toHaveTextContent('モデル読み込み')
    const summary = screen.getByLabelText('集計')
    expect(summary).toHaveTextContent('1 件')
    expect(summary).toHaveTextContent('✅ 合格線を満たしています')

    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await user.click(screen.getByRole('button', { name: 'JSON で保存' }))
    expect(click).toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('reports slow results and load failures', async () => {
    const slow = fakeTranscribeDeps()
    const user = userEvent.setup()
    const { unmount } = renderLab(slow.deps, 5000)
    await user.upload(await screen.findByLabelText('音声ファイル（複数可）'), [
      new File(['a'], 'a.m4a', { type: 'audio/mp4' }),
    ])
    await waitFor(() => expect(screen.getByRole('button', { name: '計測する' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: '計測する' }))
    expect(await screen.findByText(/合格線に届いていません/)).toBeInTheDocument()
    unmount()

    const broken = fakeTranscribeDeps({ loadError: new Error('fetch failed') })
    renderLab(broken.deps)
    await user.upload(await screen.findByLabelText('音声ファイル（複数可）'), [
      new File(['a'], 'a.m4a', { type: 'audio/mp4' }),
    ])
    await waitFor(() => expect(screen.getByRole('button', { name: '計測する' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: '計測する' }))
    expect(await screen.findByText('失敗: fetch failed')).toBeInTheDocument()
  })
})
