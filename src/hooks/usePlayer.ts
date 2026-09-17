import { useSyncExternalStore } from 'react'
import { createPlayer, type Player, type PlayerState } from '../lib/player'

let shared: Player | null = null

export function getPlayer(): Player {
  shared ??= createPlayer()
  return shared
}

/** テスト用: 共有プレイヤーを差し替える */
export function setPlayerForTest(player: Player | null): void {
  shared = player
}

export function usePlayer(): { player: Player; state: PlayerState } {
  const player = getPlayer()
  const state = useSyncExternalStore(player.subscribe, player.getState, player.getState)
  return { player, state }
}

/** 状態の一部だけを購読する（値はプリミティブにすること） */
export function usePlayerValue<T extends string | number | boolean | null>(
  select: (state: PlayerState) => T,
): T {
  const player = getPlayer()
  const read = () => select(player.getState())
  return useSyncExternalStore(player.subscribe, read, read)
}
