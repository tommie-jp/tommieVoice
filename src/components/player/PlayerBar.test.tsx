import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setPlayerForTest } from '../../hooks/usePlayer'
import { createPlayer } from '../../lib/player'
import { PlayerBar } from './PlayerBar'

describe('PlayerBar', () => {
  afterEach(() => setPlayerForTest(null))

  it('renders nothing when idle', () => {
    setPlayerForTest(createPlayer(document.createElement('audio')))
    const { container } = render(<PlayerBar />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the current item, cycles the rate and closes', async () => {
    const player = createPlayer(document.createElement('audio'))
    setPlayerForTest(player)
    const user = userEvent.setup()
    render(<PlayerBar />)
    act(() => player.playQueue([{ id: 'a', url: '/a.m4a', label: '#1 たろう' }], 0))
    expect(screen.getByText('#1 たろう')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '再生速度 1 倍' }))
    expect(player.getState().rate).toBe(1.25)
    await user.click(screen.getByRole('button', { name: '一時停止' }))
    expect(await screen.findByRole('button', { name: '再生' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '再生を閉じる' }))
    expect(screen.queryByRole('region', { name: '再生中' })).not.toBeInTheDocument()
  })

  it('shows player errors', () => {
    const el = document.createElement('audio')
    const player = createPlayer(el)
    setPlayerForTest(player)
    render(<PlayerBar />)
    act(() => {
      player.playQueue([{ id: 'a', url: '/a.m4a', label: '#1' }], 0)
      el.dispatchEvent(new Event('error'))
    })
    expect(screen.getByRole('alert')).toHaveTextContent('再生できませんでした')
  })
})
