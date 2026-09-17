import { forgetDeleteToken, getDeleteToken, saveDeleteToken } from './postTokens'

describe('postTokens', () => {
  beforeEach(() => localStorage.clear())

  it('stores and forgets tokens per post', () => {
    saveDeleteToken('p1', 't1')
    saveDeleteToken('p2', 't2')
    expect(getDeleteToken('p1')).toBe('t1')
    forgetDeleteToken('p1')
    expect(getDeleteToken('p1')).toBeNull()
    expect(getDeleteToken('p2')).toBe('t2')
  })

  it('ignores corrupted storage', () => {
    localStorage.setItem('tv.deleteTokens', '{not json')
    expect(getDeleteToken('p1')).toBeNull()
    saveDeleteToken('p1', 't1')
    expect(getDeleteToken('p1')).toBe('t1')
  })

  it('keeps at most 500 entries', () => {
    for (let i = 0; i < 505; i += 1) saveDeleteToken(`p${i}`, `t${i}`)
    expect(getDeleteToken('p0')).toBeNull()
    expect(getDeleteToken('p504')).toBe('t504')
  })
})
