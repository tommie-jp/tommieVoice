import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../../api/client'
import { fakeRecorder } from '../../test/fakeRecorder'
import { RecorderSheet } from './RecorderSheet'

function setup(props: Partial<Parameters<typeof RecorderSheet>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  const onClose = vi.fn()
  const user = userEvent.setup()
  render(
    <RecorderSheet
      heading="新しいスレッド"
      requireTitle
      onSubmit={onSubmit}
      onClose={onClose}
      createRecorder={() => fakeRecorder()}
      {...props}
    />,
  )
  return { user, onSubmit, onClose }
}

async function record(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '録音' }))
  await user.click(await screen.findByRole('button', { name: '停止' }))
  await screen.findByRole('button', { name: '録り直す' })
}

describe('RecorderSheet', () => {
  beforeEach(() => localStorage.clear())

  it('shows preview with retake and post buttons after stop', async () => {
    const { user } = setup()
    await record(user)
    expect(screen.getByLabelText('録音の試聴')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '録り直す' }))
    expect(screen.getByRole('button', { name: '録音' })).toBeInTheDocument()
  })

  it('requires a title before posting a new thread and trims it', async () => {
    const { user, onSubmit } = setup()
    await record(user)
    const submit = screen.getByRole('button', { name: '投稿する' })
    expect(submit).toBeDisabled()
    await user.type(screen.getByLabelText('タイトル'), '  決め台詞  ')
    await user.type(screen.getByLabelText('名前（任意）'), 'はなこ')
    await user.click(submit)
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: '決め台詞', authorName: 'はなこ' }),
    )
    expect(localStorage.getItem('tv.authorName')).toBe('はなこ')
  })

  it('limits title input to 40 chars', () => {
    setup()
    expect(screen.getByLabelText('タイトル')).toHaveAttribute('maxLength', '40')
  })

  it('allows replies without a title and shows the reply target', async () => {
    const { user, onSubmit } = setup({ requireTitle: false, replyToSeq: 3, heading: '#3 に返事' })
    expect(screen.getByText('>>3 への返事')).toBeInTheDocument()
    await record(user)
    await user.click(screen.getByRole('button', { name: '投稿する' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: null, authorName: null }),
    )
  })

  it('disables post while uploading', async () => {
    let resolve!: () => void
    const { user } = setup({
      requireTitle: false,
      onSubmit: () => new Promise<void>((r) => (resolve = r)),
    })
    await record(user)
    await user.click(screen.getByRole('button', { name: '投稿する' }))
    expect(screen.getByRole('button', { name: '送信中…' })).toBeDisabled()
    resolve()
  })

  it('shows server error message on 429', async () => {
    const { user } = setup({
      requireTitle: false,
      onSubmit: () => Promise.reject(new ApiError(429, 'rate_limited', '操作が多すぎます')),
    })
    await record(user)
    await user.click(screen.getByRole('button', { name: '投稿する' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('操作が多すぎます')
    await waitFor(() => expect(screen.getByRole('button', { name: '投稿する' })).toBeEnabled())
  })

  it('shows the script and the broadcast consent line', () => {
    setup({ scriptText: '台本テキスト' })
    expect(screen.getByText('台本テキスト')).toBeInTheDocument()
    expect(screen.getByText(/配信などで紹介されることがあります/)).toBeInTheDocument()
  })

  it('shows microphone errors', async () => {
    const user = userEvent.setup()
    render(
      <RecorderSheet
        heading="h"
        requireTitle={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
        createRecorder={() => fakeRecorder({ failStart: new Error('マイクがありません') })}
      />,
    )
    await user.click(screen.getByRole('button', { name: '録音' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('マイクがありません')
  })

  it('closes from the button and the backdrop', async () => {
    const { user, onClose } = setup()
    await user.click(screen.getByRole('button', { name: '閉じる' }))
    await user.click(screen.getByRole('dialog').parentElement!)
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
