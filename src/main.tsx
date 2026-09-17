import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installConsoleCapture } from './lib/consoleCapture'
import { pickMimeType } from './lib/audioRecorder'
import { APP_COMMIT_COUNTER, APP_DATE, APP_VERSION } from '../shared/appVersion.ts'

installConsoleCapture()

document.title = `tommieVoice ${APP_VERSION}#${APP_COMMIT_COUNTER}`

// 起動時に環境情報を出す（iPhone 実機デバッグの起点）
console.log(
  `tommieVoice ${APP_VERSION} #${APP_COMMIT_COUNTER} (${APP_DATE})`,
  new Date().toISOString(),
)
console.log('UA:', navigator.userAgent)
console.log('URL:', location.href)
console.log('録音対応 MIME:', pickMimeType() ?? 'なし')
console.log(
  'getUserMedia:',
  typeof navigator.mediaDevices?.getUserMedia === 'function' ? 'あり' : 'なし',
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
