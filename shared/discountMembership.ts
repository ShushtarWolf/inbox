import { applyDiscountPercent, clampDiscountPercent } from './discountCode.ts'

export type MembershipLike = {
  id: string
  percent: number
  labelFa: string
  labelEn?: string | null
  expiresAt?: Date | string | null
  revokedAt?: Date | string | null
  programActive?: boolean
}

/** Active = not revoked, not expired, program still on (when known). */
export function isDiscountMembershipActive(
  row: Pick<MembershipLike, 'expiresAt' | 'revokedAt' | 'programActive'>,
  now = new Date(),
): boolean {
  if (row.revokedAt) return false
  if (row.programActive === false) return false
  if (row.expiresAt && new Date(row.expiresAt) < now) return false
  return true
}

export function pickBestDiscountMembership<T extends MembershipLike>(
  rows: T[],
  now = new Date(),
): T | null {
  let best: T | null = null
  for (const row of rows) {
    if (!isDiscountMembershipActive(row, now)) continue
    const percent = clampDiscountPercent(row.percent)
    if (percent < 1) continue
    if (!best || percent > clampDiscountPercent(best.percent)) best = row
  }
  return best
}

export function membershipDiscountCode(membershipId: string): string {
  return `MEMBER:${membershipId}`
}

export function isMembershipDiscountCode(code: string | null | undefined): boolean {
  return String(code || '').startsWith('MEMBER:')
}

export function applyMembershipDiscount(subtotal: number, percent: number) {
  return applyDiscountPercent(subtotal, percent)
}

/** Months from approval; null/0 → no expiry. */
export function membershipExpiresAt(
  approvedAt: Date,
  validityMonths: number | null | undefined,
): Date | null {
  const months = validityMonths == null ? 0 : Math.round(Number(validityMonths))
  if (!Number.isFinite(months) || months < 1) return null
  const expires = new Date(approvedAt)
  expires.setUTCMonth(expires.getUTCMonth() + Math.min(120, months))
  return expires
}
