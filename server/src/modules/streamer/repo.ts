import { and, eq, isNull, sql } from 'drizzle-orm'
import type { StreamerPublic } from '../../../../shared/schemas/streamer.ts'
import type { Db } from '../../db/client.ts'
import { streamers, type StreamerRow } from '../../db/schema/index.ts'

export function toStreamerPublic(row: StreamerRow): StreamerPublic {
  return {
    id: row.id,
    displayName: row.displayName,
    createdAt: row.createdAt.toISOString(),
    disabled: row.disabledAt !== null,
  }
}

export async function insertStreamer(
  db: Db,
  values: { id: string; displayName: string; loginKeyHash: string },
): Promise<StreamerRow> {
  const [row] = await db.insert(streamers).values(values).returning()
  if (!row) throw new Error('insert streamer failed')
  return row
}

export async function listStreamers(db: Db): Promise<StreamerRow[]> {
  return db.select().from(streamers).orderBy(streamers.createdAt)
}

export async function findActiveStreamer(db: Db, id: string): Promise<StreamerRow | null> {
  const [row] = await db
    .select()
    .from(streamers)
    .where(and(eq(streamers.id, id), isNull(streamers.disabledAt)))
    .limit(1)
  return row ?? null
}

export async function findStreamerByKeyHash(db: Db, hash: string): Promise<StreamerRow | null> {
  const [row] = await db
    .select()
    .from(streamers)
    .where(and(eq(streamers.loginKeyHash, hash), isNull(streamers.disabledAt)))
    .limit(1)
  return row ?? null
}

/** 鍵を差し替え、既存セッションを無効にする */
export async function rotateStreamerKey(
  db: Db,
  id: string,
  hash: string,
): Promise<StreamerRow | null> {
  const [row] = await db
    .update(streamers)
    .set({ loginKeyHash: hash, sessionVersion: sql`${streamers.sessionVersion} + 1` })
    .where(eq(streamers.id, id))
    .returning()
  return row ?? null
}

export async function setStreamerDisabled(db: Db, id: string, disabled: boolean, now: Date) {
  const [row] = await db
    .update(streamers)
    .set({
      disabledAt: disabled ? now : null,
      sessionVersion: sql`${streamers.sessionVersion} + 1`,
    })
    .where(eq(streamers.id, id))
    .returning()
  return row ?? null
}
