// Web とサーバで共有する定数。ここを唯一の定義にする。

/** 録音の上限（ミリ秒）。設計メモ 02 の決定: 90 秒 */
export const MAX_RECORDING_MS = 90_000

/** クライアント計測の誤差を許す上限（ミリ秒） */
export const MAX_REPORTED_DURATION_MS = MAX_RECORDING_MS + 2_000

/** アップロード 1 件の上限バイト数（8 MB）。nginx の client_max_body_size はこれより大きくする */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

/** 受け付ける音声 MIME（パラメータ部を除いた形） */
export const ACCEPTED_AUDIO_MIME = ['audio/webm', 'audio/mp4', 'audio/ogg'] as const
export type AcceptedAudioMime = (typeof ACCEPTED_AUDIO_MIME)[number]

export const TITLE_MAX_LENGTH = 40
export const AUTHOR_NAME_MAX_LENGTH = 20
export const TOPIC_TITLE_MAX_LENGTH = 60
export const TOPIC_DESCRIPTION_MAX_LENGTH = 400
export const SCRIPT_TEXT_MAX_LENGTH = 4000

/** 一覧のページサイズ */
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 50

/** レート制限（設計メモ 02 §3.9） */
export const RATE_LIMITS = {
  global: { max: 120, windowMs: 60_000 },
  /** 同じ IP から（携帯回線は多数の利用者が 1 つの IP を共有するので緩め） */
  upload: { max: 20, windowMs: 10 * 60_000 },
  /** 同じ端末 ID から */
  uploadPerDevice: { max: 5, windowMs: 10 * 60_000 },
  report: { max: 10, windowMs: 60 * 60_000 },
  adminAuthFailure: { max: 5, windowMs: 60_000 },
  streamerLogin: { max: 10, windowMs: 10 * 60_000 },
} as const

/** 通報理由 */
export const REPORT_REASONS = ['abuse', 'privacy', 'copyright', 'spam', 'other'] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

/** 端末 ID を送るヘッダ名 */
export const DEVICE_ID_HEADER = 'x-device-id'
/** 本人削除トークンを送るヘッダ名 */
export const DELETE_TOKEN_HEADER = 'x-delete-token'
/** CSRF 対策の独自ヘッダ（配信者 API の変更系で必須） */
export const CSRF_HEADER = 'x-requested-with'
export const CSRF_HEADER_VALUE = 'tommieVoice'

/** E2E 用に緩めた制限（本番では使えない。server/src/config.ts で拒否） */
export const RELAXED_RATE_LIMITS = {
  ...RATE_LIMITS,
  global: { max: 10_000, windowMs: 60_000 },
  upload: { max: 1_000, windowMs: 10 * 60_000 },
  uploadPerDevice: { max: 1_000, windowMs: 10 * 60_000 },
  report: { max: 1_000, windowMs: 60 * 60_000 },
} as const
