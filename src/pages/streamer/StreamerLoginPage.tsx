import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { errorMessage } from '../../api/client'
import { streamerLogin } from '../../api/streamer'
import { PageHeader } from '../../components/Layout'

export function StreamerLoginPage() {
  const navigate = useNavigate()
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await streamerLogin(key.trim())
      navigate('/streamer', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="配信者ログイン" back="/" />
      <main className="page">
        <form className="sheet-form panel" onSubmit={submit}>
          <label className="field-label" htmlFor="login-key">
            ログインキー（運営から受け取ったもの）
          </label>
          <input
            id="login-key"
            className="text-input"
            type="password"
            autoComplete="current-password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            className="primary-button"
            disabled={busy || key.trim().length < 20}
          >
            ログイン
          </button>
          <p className="consent-note">この端末に 30 日間ログインしたままになります。</p>
        </form>
      </main>
    </>
  )
}
