import { useState, type FormEvent } from 'react'
import type { StreamerPublic } from '../../../shared/schemas/streamer.ts'
import { errorMessage } from '../../api/client'
import {
  adminCreateStreamer,
  adminListStreamers,
  adminRotateStreamerKey,
  adminSetStreamerDisabled,
} from '../../api/streamer'
import { useAsync } from '../../hooks/useAsync'
import { StatusBlock } from '../Layout'

type Issued = { name: string; loginKey: string }

function IssuedKey({ issued, onClose }: { issued: Issued; onClose(): void }) {
  return (
    <div className="notice issued-key" role="status">
      <p>
        <strong>{issued.name}</strong> さんのログインキー（この画面を閉じると二度と表示されません）
      </p>
      <code className="key-text">{issued.loginKey}</code>
      <p className="card-meta">
        安全な方法で本人に渡してください。ログインは /streamer/login から。
      </p>
      <button type="button" className="secondary-button" onClick={onClose}>
        控えたので閉じる
      </button>
    </div>
  )
}

function StreamerRow({
  streamer,
  token,
  onIssued,
  onChanged,
}: {
  streamer: StreamerPublic
  token: string
  onIssued(i: Issued): void
  onChanged(): void
}) {
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<void>) => {
    setError(null)
    try {
      await fn()
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    }
  }
  return (
    <li className="admin-row">
      <div>
        <strong>{streamer.displayName}</strong>
        <div className="card-meta">{streamer.disabled ? '停止中' : '有効'}</div>
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
          onClick={() =>
            void run(async () => {
              if (
                !window.confirm(
                  `${streamer.displayName} さんのキーを再発行しますか？ 今のログインは切れます`,
                )
              )
                return
              const { data } = await adminRotateStreamerKey(token, streamer.id)
              onIssued({ name: streamer.displayName, loginKey: data.loginKey })
            })
          }
        >
          キー再発行
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            void run(async () => {
              await adminSetStreamerDisabled(token, streamer.id, !streamer.disabled)
            })
          }
        >
          {streamer.disabled ? '再開' : '停止'}
        </button>
      </div>
    </li>
  )
}

export function StreamerAdmin({ token }: { token: string }) {
  const streamers = useAsync(() => adminListStreamers(token).then((r) => r.data), [token])
  const [name, setName] = useState('')
  const [issued, setIssued] = useState<Issued | null>(null)
  const [error, setError] = useState<string | null>(null)

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const { data } = await adminCreateStreamer(token, name.trim())
      setIssued({ name: data.streamer.displayName, loginKey: data.loginKey })
      setName('')
      streamers.reload()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <section aria-label="配信者">
      {issued ? <IssuedKey issued={issued} onClose={() => setIssued(null)} /> : null}
      <form className="sheet-form panel" onSubmit={create}>
        <h2 className="section-title">配信者を発行する</h2>
        <label className="field-label" htmlFor="streamer-name">
          表示名
        </label>
        <input
          id="streamer-name"
          className="text-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
        />
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="primary-button" disabled={name.trim() === ''}>
          発行
        </button>
      </form>
      <StatusBlock
        loading={streamers.status === 'loading'}
        error={streamers.error}
        onRetry={streamers.reload}
      />
      <ul className="admin-list">
        {streamers.data?.map((s) => (
          <StreamerRow
            key={s.id}
            streamer={s}
            token={token}
            onIssued={setIssued}
            onChanged={streamers.reload}
          />
        ))}
      </ul>
    </section>
  )
}
