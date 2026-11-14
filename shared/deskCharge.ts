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

/**
 * Desk «تخفیف میز (٪)» field → percent. Empty / non-numeric input is 0% (full
 * price), never 100%. Accepts Persian and Arabic-Indic digits.
 */
export function parseDeskPercent(raw: string | null | undefined): number {
  const ascii = String(raw || '')
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[^\d]/g, '')
  if (!ascii) return 0
  return clampDiscountPercent(Number(ascii))
}
