import {
  calendarDayFromStoredDate,
  tehranDayEndFromIso,
  tehranDayStartFromIso,
} from './localDate.ts'

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

/** Percent off a subtotal (toman integers). */
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
  | { ok: false; reason: 'missing' | 'inactive' | 'not_started' | 'expired' | 'exhausted' | 'wrong_club' | 'wrong_user' }

export function evaluateDiscountCodeWindow(opts: {
  active: boolean
  clubId?: string | null
  bookingClubId?: string | null
  boundUserId?: string | null
  redeemingUserId?: string | null
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
  if (opts.boundUserId && opts.redeemingUserId && opts.boundUserId !== opts.redeemingUserId) {
    return { ok: false, reason: 'wrong_user' }
  }
  const now = opts.now || new Date()
  if (opts.startsAt) {
    const startDay = calendarDayFromStoredDate(opts.startsAt)
    if (now < tehranDayStartFromIso(startDay)) return { ok: false, reason: 'not_started' }
  }
  if (opts.endsAt) {
    const endDay = calendarDayFromStoredDate(opts.endsAt)
    if (now > tehranDayEndFromIso(endDay)) return { ok: false, reason: 'expired' }
  }
  const max = opts.maxRedemptions
  const used = opts.redemptionCount ?? 0
  if (typeof max === 'number' && max >= 0 && used >= max) {
    return { ok: false, reason: 'exhausted' }
  }
  return { ok: true }
}

export type DiscountCodeDisplayStatus =
  | 'active'
  | 'inactive'
  | 'expired'
  | 'exhausted'
  | 'not_started'

/** Owner-panel status from stored fields only — does not mutate DB. */
export function deriveDiscountCodeDisplayStatus(
  row: {
    active: boolean
    startsAt?: Date | string | null
    endsAt?: Date | string | null
    maxRedemptions?: number | null
    redemptionCount?: number | null
  },
  now = new Date(),
): DiscountCodeDisplayStatus {
  const verdict = evaluateDiscountCodeWindow({
    active: row.active,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    maxRedemptions: row.maxRedemptions,
    redemptionCount: row.redemptionCount,
    now,
  })
  if (verdict.ok) return 'active'
  if (verdict.reason === 'inactive') return 'inactive'
  return verdict.reason
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Parse owner YYYY-MM-DD expiry to end of that day (Tehran). */
export function parseDiscountEndsAtInput(raw: string) {
  const day = raw.trim().slice(0, 10)
  if (!ISO_DATE_RE.test(day)) {
    throw new Error('Invalid date')
  }
  return tehranDayEndFromIso(day)
}

/** Parse owner YYYY-MM-DD start to beginning of that day (Tehran). */
export function parseDiscountStartsAtInput(raw: string) {
  const day = raw.trim().slice(0, 10)
  if (!ISO_DATE_RE.test(day)) {
    throw new Error('Invalid date')
  }
  return tehranDayStartFromIso(day)
}
