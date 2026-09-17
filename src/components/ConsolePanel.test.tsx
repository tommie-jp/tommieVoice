import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { __resetForTest, installConsoleCapture } from '../lib/consoleCapture'
import { ConsolePanel } from './ConsolePanel'

describe('ConsolePanel', () => {
  beforeEach(() => {
    __resetForTest()
    installConsoleCapture()
  })
  afterEach(() => {
    __resetForTest()
  })

  it('shows the log count and expands to show lines', async () => {
    const user = userEvent.setup()
    render(<ConsolePanel />)
    act(() => console.info('hello panel'))
    const toggle = screen.getByRole('button', { name: /ログ \(1\)/ })
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('hello panel')
  })

  it('clears logs', async () => {
    const user = userEvent.setup()
    render(<ConsolePanel />)
    act(() => console.warn('to be cleared'))
    await user.click(screen.getByRole('button', { name: /ログ/ }))
    await user.click(screen.getByRole('button', { name: 'クリア' }))
    expect(screen.getByRole('button', { name: /ログ \(0\)/ })).toBeInTheDocument()
  })

  it('copies text with the clipboard API', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ConsolePanel />)
    act(() => console.log('copy me'))
    await user.click(screen.getByRole('button', { name: /ログ/ }))
    await user.click(screen.getByRole('button', { name: 'コピー' }))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('copy me'))
    expect(await screen.findByRole('button', { name: 'コピー済' })).toBeInTheDocument()
  })

  it('shows a failure label when copying throws', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ConsolePanel />)
    await user.click(screen.getByRole('button', { name: /ログ/ }))
    await user.click(screen.getByRole('button', { name: 'コピー' }))
    expect(await screen.findByRole('button', { name: 'コピー失敗' })).toBeInTheDocument()
  })
})
