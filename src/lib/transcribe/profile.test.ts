import { loadProfile, saveProfile } from './profile'

describe('transcribe profile', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to quality and remembers the choice', () => {
    expect(loadProfile()).toBe('quality')
    saveProfile('light')
    expect(loadProfile()).toBe('light')
  })

  it('ignores unknown stored values', () => {
    localStorage.setItem('tv.transcribeProfile', 'turbo')
    expect(loadProfile()).toBe('quality')
  })
})
