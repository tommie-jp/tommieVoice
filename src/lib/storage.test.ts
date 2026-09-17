import { readSession, readStorage, removeStorage, writeSession, writeStorage } from './storage'

describe('storage helpers', () => {
  afterEach(() => vi.restoreAllMocks())

  it('round-trips through localStorage', () => {
    writeStorage('k', 'v')
    expect(readStorage('k')).toBe('v')
    removeStorage('k')
    expect(readStorage('k')).toBeNull()
  })

  it('keeps values in memory when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied')
    })
    writeStorage('mem', '1')
    expect(readStorage('mem')).toBe('1')
    removeStorage('mem')
    expect(readStorage('mem')).toBeNull()
  })

  it('session helpers set, clear and survive errors', () => {
    writeSession('s', 'x')
    expect(readSession('s')).toBe('x')
    writeSession('s', null)
    expect(readSession('s')).toBeNull()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(readSession('s')).toBeNull()
    expect(() => writeSession('s', 'y')).not.toThrow()
  })
})
