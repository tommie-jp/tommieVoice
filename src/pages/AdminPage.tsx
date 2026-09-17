import { useState, type FormEvent } from 'react'
import type { TopicPublic } from '../../shared/schemas/topic.ts'
import { adminCreateTopic, adminUpdateTopic, fetchTopics } from '../api/board'
import { errorMessage } from '../api/client'
import { ReportList } from '../components/admin/ReportList'
import { StreamerAdmin } from '../components/admin/StreamerAdmin'
import { adminListStreamers } from '../api/streamer'
import { PageHeader, StatusBlock } from '../components/Layout'
import { useAsync } from '../hooks/useAsync'
import { readSession, writeSession } from '../lib/storage'

const TOKEN_KEY = 'tv.adminToken'

function TokenForm({ onSave }: { onSave(token: string): void }) {
  const [value, setValue] = useState('')
  return (
    <form
      className="sheet-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (value.trim()) onSave(value.trim())
      }}
    >
      <label className="field-label" htmlFor="admin-token">
        管理トークン
      </label>
      <input
        id="admin-token"
        className="text-input"
        type="password"
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit" className="primary-button">
        使う
      </button>
      <p className="consent-note">トークンはこのタブを閉じると消えます。</p>
    </form>
  )
}

function CreateTopicForm({ token, onCreated }: { token: string; onCreated(): void }) {
  const [slug, setSlug] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [scriptText, setScriptText] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const streamers = useAsync(() => adminListStreamers(token).then((r) => r.data), [token])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await adminCreateTopic(token, {
        slug,
        title,
        description,
        scriptText,
        ...(ownerId ? { mode: 'inbox' as const, ownerId } : {}),
      })
      setSlug('')
      setOwnerId('')
      setTitle('')
      setDescription('')
      setScriptText('')
      onCreated()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="sheet-form panel" onSubmit={submit} aria-label="話題を作る">
      <h2 className="section-title">話題を作る</h2>
      <label className="field-label" htmlFor="topic-slug">
        slug（URL 用、英小文字・数字・ハイフン）
      </label>
      <input
        id="topic-slug"
        className="text-input"
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        required
      />
      <label className="field-label" htmlFor="topic-title">
        タイトル
      </label>
      <input
        id="topic-title"
        className="text-input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <label className="field-label" htmlFor="topic-desc">
        説明（任意）
      </label>
      <textarea
        id="topic-desc"
        className="text-input"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
      />
      <label className="field-label" htmlFor="topic-owner">
        種類
      </label>
      <select
        id="topic-owner"
        className="text-input"
        value={ownerId}
        onChange={(e) => setOwnerId(e.target.value)}
      >
        <option value="">公開掲示板</option>
        {streamers.data
          ?.filter((s) => !s.disabled)
          .map((s) => (
            <option key={s.id} value={s.id}>
              凸待ち箱: {s.displayName}
            </option>
          ))}
      </select>
      <label className="field-label" htmlFor="topic-script">
        台本・お題（任意）
      </label>
      <textarea
        id="topic-script"
        className="text-input"
        value={scriptText}
        onChange={(e) => setScriptText(e.target.value)}
        rows={4}
      />
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="primary-button" disabled={busy}>
        作成
      </button>
    </form>
  )
}

function TopicAdminRow({
  topic,
  token,
  onChanged,
}: {
  topic: TopicPublic
  token: string
  onChanged(): void
}) {
  const [error, setError] = useState<string | null>(null)
  const update = async (patch: Parameters<typeof adminUpdateTopic>[2]) => {
    setError(null)
    try {
      await adminUpdateTopic(token, topic.id, patch)
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    }
  }
  return (
    <li className="admin-row">
      <div>
        <strong>{topic.title}</strong> <code>/{topic.slug}</code>
        <div className="card-meta">
          順番 {topic.sortOrder} ・ {topic.threadCount} スレッド{' '}
          {topic.isClosed ? '・ 受付終了' : ''}
          {topic.mode === 'inbox' ? ` ・ 凸待ち箱（${topic.ownerName ?? '?'}）` : ''}
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="admin-actions">
        <button
          type="button"
          className="secondary-button"
          aria-label={`${topic.title} を上へ`}
          onClick={() => update({ sortOrder: topic.sortOrder - 1 })}
        >
          ↑
        </button>
        <button
          type="button"
          className="secondary-button"
          aria-label={`${topic.title} を下へ`}
          onClick={() => update({ sortOrder: topic.sortOrder + 1 })}
        >
          ↓
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => update({ isClosed: !topic.isClosed })}
        >
          {topic.isClosed ? '再開' : '受付終了'}
        </button>
      </div>
    </li>
  )
}

export function AdminPage() {
  const [token, setToken] = useState<string | null>(() => readSession(TOKEN_KEY))
  const [tab, setTab] = useState<'topics' | 'reports' | 'streamers'>('reports')
  const topics = useAsync(() => fetchTopics().then((r) => r.data), [])

  const save = (value: string | null) => {
    writeSession(TOKEN_KEY, value)
    setToken(value)
  }

  return (
    <>
      <PageHeader
        title="管理"
        back="/"
        action={
          token ? (
            <button type="button" className="text-button" onClick={() => save(null)}>
              ログアウト
            </button>
          ) : null
        }
      />
      <main className="page">
        {!token ? (
          <TokenForm onSave={save} />
        ) : (
          <>
            <div className="tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'reports'}
                className={`tab ${tab === 'reports' ? 'is-active' : ''}`}
                onClick={() => setTab('reports')}
              >
                通報
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'topics'}
                className={`tab ${tab === 'topics' ? 'is-active' : ''}`}
                onClick={() => setTab('topics')}
              >
                話題
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'streamers'}
                className={`tab ${tab === 'streamers' ? 'is-active' : ''}`}
                onClick={() => setTab('streamers')}
              >
                配信者
              </button>
            </div>
            {tab === 'reports' ? <ReportList token={token} /> : null}
            {tab === 'streamers' ? <StreamerAdmin token={token} /> : null}
          </>
        )}
        {token && tab === 'topics' ? (
          <>
            <CreateTopicForm token={token} onCreated={topics.reload} />
            <h2 className="section-title">話題一覧</h2>
            <StatusBlock
              loading={topics.status === 'loading'}
              error={topics.error}
              onRetry={topics.reload}
            />
            <ul className="admin-list">
              {topics.data?.map((t) => (
                <TopicAdminRow key={t.id} topic={t} token={token} onChanged={topics.reload} />
              ))}
            </ul>
          </>
        ) : null}
      </main>
    </>
  )
}
