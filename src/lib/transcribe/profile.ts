import { readStorage, writeStorage } from '../storage'
import { PROFILES, type ProfileName } from './types'

const KEY = 'tv.transcribeProfile'

export function loadProfile(): ProfileName {
  const stored = readStorage(KEY)
  return stored && stored in PROFILES ? (stored as ProfileName) : 'quality'
}

export function saveProfile(profile: ProfileName): void {
  writeStorage(KEY, profile)
}
