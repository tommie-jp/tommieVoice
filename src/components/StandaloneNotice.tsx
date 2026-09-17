import { useState } from 'react'
import { isIosStandalone } from '../lib/standalone'
import { readStorage, writeStorage } from '../lib/storage'

const KEY = 'tv.standaloneNoticeDismissed'

/**
 * iOS のホーム画面アプリでは 2 回目以降の起動で録音が始まらない不具合が報告されている。
 * 録音できないときは Safari で開くよう案内する。
 */
export function StandaloneNotice() {
  const [dismissed, setDismissed] = useState(() => readStorage(KEY) === '1')
  if (dismissed || !isIosStandalone()) return null
  return (
    <div className="notice standalone-notice" role="note">
      録音が始まらないときは、Safari で voice.tommie.jp を開いてください。
      <button
        type="button"
        className="text-button"
        onClick={() => {
          writeStorage(KEY, '1')
          setDismissed(true)
        }}
      >
        閉じる
      </button>
    </div>
  )
}
