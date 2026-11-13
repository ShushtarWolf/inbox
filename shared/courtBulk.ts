export const COURT_BULK_MIN = 1
export const COURT_BULK_MAX = 30

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

export function toFaDigits(value: number | string) {
  return String(value).replace(/\d/g, (d) => FA_DIGITS[Number(d)] ?? d)
}

/** Default 1. Rejects non-integers and values outside 1–30. */
export function parseCourtBulkCount(raw: unknown): number {
  if (raw == null || raw === '') return COURT_BULK_MIN
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
  if (!Number.isInteger(n) || n < COURT_BULK_MIN || n > COURT_BULK_MAX) {
    throw new Error('Invalid court count')
  }
  return n
}

export function numberedCourtNames(input: {
  nameFa?: string | null
  nameEn?: string | null
  index: number
  total: number
}): { nameFa: string; nameEn: string } {
  const baseFa = input.nameFa?.trim() || ''
  const baseEn = input.nameEn?.trim() || ''
  if (input.total <= 1) {
    return {
      nameFa: baseFa || 'زمین جدید',
      nameEn: baseEn || 'New court',
    }
  }
  const nFa = toFaDigits(input.index)
  return {
    nameFa: `${baseFa || 'زمین'} ${nFa}`,
    nameEn: `${baseEn || 'Court'} ${input.index}`,
  }
}

export type BulkCourtFields = {
  price: number
  sportSlug: string
  openHour: number | null
  closeHour: number | null
  audience: string
}

/**
 * «ویرایش همه» patch: only the fields the owner actually changed compared with the
 * values the sheet opened with. Time-band pricing is never copied from the seed
 * court; it is sent only when the owner explicitly opts in to replace every
 * court's pricing.
 */
export function buildBulkCourtPatch(input: {
  initial: BulkCourtFields
  current: BulkCourtFields
  applyPricingToAll: boolean
  pricingJson: string | null
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  const { initial, current } = input
  if (current.price !== initial.price) patch.price = current.price
  if (current.sportSlug !== initial.sportSlug) patch.sportSlug = current.sportSlug
  if (current.openHour !== initial.openHour || current.closeHour !== initial.closeHour) {
    patch.openHour = current.openHour
    patch.closeHour = current.closeHour
  }
  if (current.audience !== initial.audience) patch.audience = current.audience
  if (input.applyPricingToAll) patch.pricingJson = input.pricingJson
  return patch
}
