import { useState } from 'react'
import { errorMessage } from '../../api/client'
import { controlOverlay, fetchOverlayStatus, issueOverlayToken } from '../../api/streamer'
import { useAsync } from '../../hooks/useAsync'

/** OBS オーバーレイの URL 発行と、次を流す・停止の操作 */
export function OverlayPanel({ onChanged }: { onChanged(): void }) {
  const status = useAsync(() => fetchOverlayStatus().then((r) => r.data), [])
  const [url, setUrl] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const act = async (fn: () => Promise<string | null>) => {
    setBusy(true)
    setMessage(null)
    try {
      setMessage(await fn())
      status.reload()
      onChanged()
    } catch (err) {
      setMessage(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const issue = () =>
    act(async () => {
      if (
        status.data?.issued &&
        !window.confirm(
          'URL を作り直すと、今 OBS に貼っている URL は使えなくなります。よろしいですか？',
        )
      ) {
        return null
      }
      const { data } = await issueOverlayToken()
      setUrl(`${window.location.origin}${data.path}`)
      return null
    })

  const connections = status.data?.connections ?? 0

  return (
    <section className="panel" aria-label="OBS オーバーレイ">
      <div className="overlay-panel-head">
        <strong>OBS オーバーレイ</strong>
        <span className="card-meta">{connections > 0 ? `接続中 ${connections}` : '未接続'}</span>
      </div>
      {url ? (
        <div className="notice">
          <p>
            OBS の「ブラウザ」ソースに貼り、「OBS で音声を制御する」をオンにしてください（この URL
            は今だけ表示されます）。
          </p>
          <code className="key-text">{url}</code>
          <p className="card-meta">
            文字の大きさは末尾に ?size=48、接続表示を消すには ?quiet を付けます。
          </p>
        </div>
      ) : null}
      <div className="inbox-actions">
        <button
          type="button"
          className="primary-button"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              const { data } = await controlOverlay('next')
              return data.delivered > 0
                ? '次の声を流しました'
                : '次の声を「配信済み」にしました（オーバーレイ未接続）'
            })
          }
        >
          次を流す
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              await controlOverlay('stop')
              return '停止しました'
            })
          }
        >
          停止
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => void issue()}
        >
          {status.data?.issued ? 'URL を作り直す' : 'URL を発行'}
        </button>
      </div>
      {message ? <p role="status">{message}</p> : null}
    </section>
  )
}
