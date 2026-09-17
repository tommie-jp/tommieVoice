import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/** 端末 ID を鍵付きハッシュにする（生の値は保存しない） */
export function hmacDeviceId(key: string, deviceId: string): string {
  return createHmac('sha256', key).update(`device:${deviceId}`).digest('hex')
}

/** IP を鍵付きハッシュにする（生の値は保存しない） */
export function hmacIp(key: string, ip: string): string {
  return createHmac('sha256', key).update(`ip:${ip}`).digest('hex')
}

/** 高エントロピーのトークン（削除トークン・ログインキー）の保存用ハッシュ */
export function sha256Token(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** 長さの違いも含めて一定時間で比較する */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb) && a.length === b.length
}
