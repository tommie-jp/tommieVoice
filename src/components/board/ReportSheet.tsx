import { useState, type FormEvent } from 'react'
import { REPORT_REASONS, type ReportReason } from '../../../shared/constants.ts'
import { REPORT_REASON_LABELS } from '../../../shared/schemas/report.ts'
import { errorMessage } from '../../api/client'

type Props = {
  seq: number
  onSubmit(reason: ReportReason): Promise<void>
  onClose(): void
}

export function ReportSheet({ seq, onSubmit, onClose }: Props) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!reason) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(reason)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={busy ? undefined : onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`#${seq} を通報`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-header">
          <h2 className="sheet-title">#{seq} を通報</h2>
          <button type="button" className="text-button" onClick={onClose} disabled={busy}>
            閉じる
          </button>
        </div>
        <form className="sheet-form" onSubmit={submit}>
          <fieldset className="reason-list">
            <legend className="field-label">理由</legend>
            {REPORT_REASONS.map((r) => (
              <label key={r} className="reason-option">
                <input
                  type="radio"
                  name="reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                />
                {REPORT_REASON_LABELS[r]}
              </label>
            ))}
          </fieldset>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="primary-button" disabled={!reason || busy}>
            {busy ? '送信中…' : '通報する'}
          </button>
          <p className="consent-note">運営が確認し、規約違反なら非表示にします。</p>
        </form>
      </div>
    </div>
  )
}
