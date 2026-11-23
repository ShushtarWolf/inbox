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

function latinDigitsFromFa(s: string): string {
  return s.replace(/[۰-۹]/g, (ch) => {
    const i = FA_DIGITS.indexOf(ch)
    return i >= 0 ? String(i) : ch
  })
}

/** When a bulk base name ends in a number, return prefix + starting index (ASCII or Persian digits). */
export function parseTrailingCourtIndex(base: string): { prefix: string, start: number } | null {
  const trimmed = base.trim()
  if (!trimmed) return null
  const match = trimmed.match(/^(.*?)(?:\s+)?([۰-۹\d]+)$/u)
  if (!match) return null
  const prefix = match[1].trimEnd()
  const start = parseInt(latinDigitsFromFa(match[2]), 10)
  if (!Number.isFinite(start)) return null
  return { prefix, start }
}

function bulkCourtLabel(prefix: string, index: number, trailingStart: number | null, useFaDigits: boolean): string {
  const n = trailingStart != null ? trailingStart + index - 1 : index
  const num = useFaDigits ? toFaDigits(n) : String(n)
  return `${prefix} ${num}`
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
  const trailFa = baseFa ? parseTrailingCourtIndex(baseFa) : null
  const trailEn = baseEn ? parseTrailingCourtIndex(baseEn) : null
  const prefixFa = trailFa?.prefix || baseFa || 'زمین'
  const prefixEn = trailEn?.prefix || baseEn || 'Court'
  return {
    nameFa: bulkCourtLabel(prefixFa, input.index, trailFa?.start ?? null, true),
    nameEn: bulkCourtLabel(prefixEn, input.index, trailEn?.start ?? null, false),
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
