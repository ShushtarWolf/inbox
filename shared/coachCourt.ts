import { applyDiscountPercent } from './discountCode.ts'
import { computeListedSlotPrice } from './courtPricing.ts'

export type CoachCourtCharge = {
  /** Normal listed price an athlete would pay for the slot. */
  listed: number
  discountAmount: number
  /** What the coach wallet is actually debited. */
  charge: number
}

/**
 * A coach books the court themselves and the student pays only the lesson fee, so the
 * club bills the coach the listed slot price minus the discount that club set on the link.
 * Single source of truth: quoting and charging must never disagree.
 */
export function computeCoachCourtCharge(input: {
  courtPrice: number
  startTime: string
  pricingJson?: string | null
  discountPercent: number
}): CoachCourtCharge {
  const listed = computeListedSlotPrice(input.courtPrice, input.startTime, input.pricingJson)
  const { discountAmount, total } = applyDiscountPercent(listed, input.discountPercent)
  return { listed, discountAmount, charge: total }
}
