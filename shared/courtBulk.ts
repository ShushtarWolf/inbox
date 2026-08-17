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
