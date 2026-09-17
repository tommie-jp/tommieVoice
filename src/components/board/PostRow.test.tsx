import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PostPublic } from '../../../shared/schemas/post.ts'
import { makePost } from '../../test/fakeApi'
import { PostRow } from './PostRow'

describe('PostRow', () => {
  it('shows anonymous author, title-less body and fires callbacks', async () => {
    const post = makePost(2, { parentSeq: 1, parentPostId: makePost(1).id }) as PostPublic
    const onPlay = vi.fn()
    const onReply = vi.fn()
    const onJump = vi.fn()
    const user = userEvent.setup()
    render(
      <ol>
        <PostRow
          post={post}
          isCurrent={false}
          isPlaying={false}
          onPlay={onPlay}
          onReply={onReply}
          onJump={onJump}
        />
      </ol>,
    )
    expect(screen.getByText('名無し')).toBeInTheDocument()
    expect(screen.getByText('0:02')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '#2 を再生' }))
    await user.click(screen.getByRole('button', { name: '返事する' }))
    await user.click(screen.getByRole('button', { name: '>>1' }))
    expect(onPlay).toHaveBeenCalledWith(post)
    expect(onReply).toHaveBeenCalledWith(post)
    expect(onJump).toHaveBeenCalledWith(1)
  })

  it('marks the current playing row', () => {
    const post = makePost(1) as PostPublic
    render(
      <ol>
        <PostRow
          post={post}
          isCurrent
          isPlaying
          onPlay={vi.fn()}
          onReply={vi.fn()}
          onJump={vi.fn()}
        />
      </ol>,
    )
    expect(screen.getByRole('listitem')).toHaveClass('is-current')
    expect(screen.getByRole('button', { name: '#1 を一時停止' })).toBeInTheDocument()
  })
})
