import { getDeviceId } from './deviceId'

describe('getDeviceId', () => {
  beforeEach(() => localStorage.clear())

  it('generates once and persists', () => {
    const first = getDeviceId()
    expect(first).toMatch(/^[0-9a-f-]{36}$/)
    expect(getDeviceId()).toBe(first)
    expect(localStorage.getItem('tv.deviceId')).toBe(first)
  })

  it('replaces a corrupted stored value', () => {
    localStorage.setItem('tv.deviceId', 'garbage')
    expect(getDeviceId()).not.toBe('garbage')
  })

  it('falls back to getRandomValues when randomUUID is unavailable', () => {
    const spy = vi.spyOn(crypto, 'randomUUID').mockImplementation(undefined as never)
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
    const id = getDeviceId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    spy.mockRestore()
  })
})
