import { sql, type SQL } from 'drizzle-orm'

const IDENT = /^"?[a-z_][a-z0-9_]*"?$/

/**
 * 一般公開してよい投稿の条件（shared/visibility.ts と同じ規則）。
 * 相関サブクエリでも使えるよう、投稿と話題のテーブル別名を受け取る。
 */
export function publicPostCondition(postAlias: string, topicAlias: string): SQL {
  if (!IDENT.test(postAlias) || !IDENT.test(topicAlias)) throw new Error('invalid alias')
  return sql.raw(
    `(${postAlias}.status IN ('processing', 'ready') AND (${topicAlias}.mode = 'board' OR ${topicAlias}.publish_on = 'immediately' OR ${postAlias}.review_status = 'aired'))`,
  )
}
