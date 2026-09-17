import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecordButton } from './RecordButton'

describe('RecordButton', () => {
  it('shows 録音 label when idle', () => {
    render(<RecordButton status="idle" elapsedMs={0} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: '録音' })).toBeInTheDocument()
  })

  it('shows 停止 label and elapsed time when recording', () => {
    render(<RecordButton status="recording" elapsedMs={65_000} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: '停止' })).toBeInTheDocument()
    expect(screen.getByText('1:05')).toBeInTheDocument()
  })

  it('invokes onToggle on click', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(<RecordButton status="idle" elapsedMs={0} onToggle={onToggle} />)
    await user.click(screen.getByRole('button', { name: '録音' }))
    expect(onToggle).toHaveBeenCalledOnce()
  })
})
