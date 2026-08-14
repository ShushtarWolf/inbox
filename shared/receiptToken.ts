import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export function bookingTrackingCode(bookingId: string) {
  const n = parseInt(createHash('sha256').update(`track:${bookingId}`).digest('hex').slice(0, 8), 16)
  return String(1000000 + (n % 9000000))
}

export function signReceiptToken(bookingId: string, secret: string) {
  const sig = createHmac('sha256', secret).update(bookingId).digest('base64url').slice(0, 10)
  return Buffer.from(`${bookingId}.${sig}`, 'utf8').toString('base64url')
}

export function parseReceiptToken(token: string, secret: string): string | null {
  if (!token?.trim()) return null
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8')
    const dot = raw.lastIndexOf('.')
    if (dot <= 0) return null
    const bookingId = raw.slice(0, dot)
    const sig = raw.slice(dot + 1)
    if (!bookingId || !sig) return null
    const expected = createHmac('sha256', secret).update(bookingId).digest('base64url').slice(0, 10)
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    return bookingId
  } catch {
    return null
  }
}

export function receiptPath(token: string) {
  return `/r/${encodeURIComponent(token)}`
}
