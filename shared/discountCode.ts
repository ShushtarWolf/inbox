/** Normalize athlete-entered codes: trim, uppercase, strip spaces. */
export function normalizeDiscountCode(raw: string | null | undefined): string {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase()
}

export function clampDiscountPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0
  return Math.min(100, Math.max(0, Math.round(percent)))
}

/** Percent off a subtotal (rial integers). */
export function applyDiscountPercent(subtotal: number, percent: number): {
  discountAmount: number
  total: number
} {
  const safeSubtotal = Math.max(0, Math.round(subtotal) || 0)
  const pct = clampDiscountPercent(percent)
  if (pct <= 0 || safeSubtotal <= 0) {
    return { discountAmount: 0, total: safeSubtotal }
  }
  const discountAmount = Math.min(safeSubtotal, Math.round(safeSubtotal * (pct / 100)))
  return { discountAmount, total: safeSubtotal - discountAmount }
}

export type DiscountCodeValidity =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'inactive' | 'not_started' | 'expired' | 'exhausted' | 'wrong_club' }

export function evaluateDiscountCodeWindow(opts: {
  active: boolean
  clubId?: string | null
  bookingClubId?: string | null
  startsAt?: Date | string | null
  endsAt?: Date | string | null
  maxRedemptions?: number | null
  redemptionCount?: number | null
  now?: Date
}): DiscountCodeValidity {
  if (!opts.active) return { ok: false, reason: 'inactive' }
  if (opts.clubId && opts.bookingClubId && opts.clubId !== opts.bookingClubId) {
    return { ok: false, reason: 'wrong_club' }
  }
  if (opts.clubId && !opts.bookingClubId) {
    return { ok: false, reason: 'wrong_club' }
  }
  const now = opts.now || new Date()
  if (opts.startsAt && new Date(opts.startsAt) > now) return { ok: false, reason: 'not_started' }
  if (opts.endsAt && new Date(opts.endsAt) < now) return { ok: false, reason: 'expired' }
  const max = opts.maxRedemptions
  const used = opts.redemptionCount ?? 0
  if (typeof max === 'number' && max >= 0 && used >= max) {
    return { ok: false, reason: 'exhausted' }
  }
  return { ok: true }
}
