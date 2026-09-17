import { isSafeHttpUrl } from './safeUrl'

describe('isSafeHttpUrl', () => {
  it.each([
    ['https://youtube.com/watch?v=1', true],
    ['http://twitch.tv/x', true],
    ['javascript:alert(1)', false],
    ['data:text/html,1', false],
    ['not a url', false],
    [null, false],
  ])('%s → %s', (value, expected) => {
    expect(isSafeHttpUrl(value)).toBe(expected)
  })
})
