import { applyDiscountPercent, clampDiscountPercent } from './discountCode.ts'

/** Desk confirm: cash / unpaid / complimentary — percent is 0–100. */
export function resolveDeskCharge(opts: {
  subtotal: number
  complimentary?: boolean
  percent?: number
}): {
  amount: number
  discountAmount: number
  percent: number
  complimentary: boolean
} {
  const subtotal = Math.max(0, Math.round(Number(opts.subtotal) || 0))
  if (opts.complimentary) {
    return { amount: 0, discountAmount: subtotal, percent: 100, complimentary: true }
  }
  const percent = clampDiscountPercent(Number(opts.percent) || 0)
  const { discountAmount, total } = applyDiscountPercent(subtotal, percent)
  return { amount: total, discountAmount, percent, complimentary: false }
}
