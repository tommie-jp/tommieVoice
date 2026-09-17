import type { PublishPolicy, TopicMode } from './schemas/topic.ts'

export type VisibilityTopic = { mode: TopicMode; publishOn: PublishPolicy }
export type VisibilityPost = {
  status: 'processing' | 'ready' | 'failed' | 'hidden' | 'deleted'
  reviewStatus: 'pending' | 'approved' | 'rejected' | 'aired' | null
}

/** 一般の閲覧者に見せてよい投稿か（server の publicPostCondition と同じ規則） */
export function isPubliclyVisible(topic: VisibilityTopic, post: VisibilityPost): boolean {
  if (post.status !== 'processing' && post.status !== 'ready') return false
  if (topic.mode === 'board' || topic.publishOn === 'immediately') return true
  return post.reviewStatus === 'aired'
}
