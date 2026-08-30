import { computeListedSlotPrice } from './courtPricing.ts'

export type CoachCourtCharge = {
  /** Normal listed price an athlete would pay for the slot. */
  listed: number
  discountAmount: number
  /** What the coach wallet is actually debited (full listed price; no club discount). */
  charge: number
}

/**
 * A coach books the court themselves and the student pays only the lesson fee.
 * Court charge is always the listed slot price — no owner–coach discount relationship.
 */
export function computeCoachCourtCharge(input: {
  courtPrice: number
  startTime: string
  pricingJson?: string | null
}): CoachCourtCharge {
  const listed = computeListedSlotPrice(input.courtPrice, input.startTime, input.pricingJson)
  return { listed, discountAmount: 0, charge: listed }
}
