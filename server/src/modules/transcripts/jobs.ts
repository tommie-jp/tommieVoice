import { sql } from 'drizzle-orm'
import type { Db } from '../../db/client.ts'
import { newId } from '../../lib/ids.ts'

/** 公開用音声ができた投稿について、話題が文字起こし対象ならジョブを積む（冪等） */
export async function enqueueTranscription(db: Db, postId: string): Promise<boolean> {
  const result = await db.execute(sql`
    INSERT INTO transcription_jobs (id, post_id)
    SELECT ${newId()}, p.id
    FROM posts p
    JOIN threads t ON t.id = p.thread_id
    JOIN topics tp ON tp.id = t.topic_id
    WHERE p.id = ${postId} AND p.status = 'ready' AND tp.transcribe
    ON CONFLICT (post_id) DO NOTHING
  `)
  return (result.rowCount ?? 0) > 0
}
