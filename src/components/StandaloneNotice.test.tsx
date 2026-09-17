import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { isIosStandalone } from '../lib/standalone'
import { StandaloneNotice } from './StandaloneNotice'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15'

function setNavigator(ua: string, standalone: boolean | undefined) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
  Object.defineProperty(navigator, 'standalone', { value: standalone, configurable: true })
}

describe('StandaloneNotice', () => {
  const originalUa = navigator.userAgent
  beforeEach(() => localStorage.clear())
  afterEach(() => setNavigator(originalUa, undefined))

  it('detects iOS standalone mode only', () => {
    setNavigator(IPHONE, true)
    expect(isIosStandalone()).toBe(true)
    setNavigator(IPHONE, false)
    expect(isIosStandalone()).toBe(false)
    setNavigator('Mozilla/5.0 (Linux; Android 15)', true)
    expect(isIosStandalone()).toBe(false)
  })

  it('renders notice only in iOS standalone mode and remembers dismissal', async () => {
    setNavigator(IPHONE, true)
    const user = userEvent.setup()
    const { unmount } = render(<StandaloneNotice />)
    expect(screen.getByRole('note')).toHaveTextContent('Safari で')
    await user.click(screen.getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    unmount()
    render(<StandaloneNotice />)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('renders nothing in the browser', () => {
    setNavigator(IPHONE, false)
    const { container } = render(<StandaloneNotice />)
    expect(container).toBeEmptyDOMElement()
  })
})
