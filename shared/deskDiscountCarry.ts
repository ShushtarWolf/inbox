/**
 * Desk re-saves of an existing booking (mark paid / mark unpaid / equipment / edit)
 * do not resend the discount — only the new-booking pay-confirm sheet has the
 * discount inputs. Carry the discount already stored on the payment so the amount
 * is never silently reset to the full list price.
 */
import { clampDiscountPercent } from './discountCode.ts'

export type CarriedDeskDiscount =
  | { kind: 'complimentary' }
  | { kind: 'code', code: string, percent: number }
  | { kind: 'percent', percent: number }

function parse(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' ? v as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

export function carriedDeskDiscount(metadataJson: string | null | undefined): CarriedDeskDiscount | null {
  const meta = parse(metadataJson)
  if (meta.complimentary === true) return { kind: 'complimentary' }
  const codePercent = clampDiscountPercent(Number(meta.discountPercent) || 0)
  if (typeof meta.discountCode === 'string' && meta.discountCode.trim() && codePercent > 0) {
    return { kind: 'code', code: meta.discountCode.trim(), percent: codePercent }
  }
  const deskPercent = clampDiscountPercent(Number(meta.deskDiscountPercent) || 0)
  if (deskPercent > 0) return { kind: 'percent', percent: deskPercent }
  return null
}

/** True when the request carries no discount instruction of its own. */
export function requestHasNoDiscount(body: {
  discountCode?: string | null
  deskDiscountPercent?: number | null
  complimentary?: boolean | null
}): boolean {
  return !body.complimentary
    && !String(body.discountCode || '').trim()
    && !(Number(body.deskDiscountPercent) > 0)
}
