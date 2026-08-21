/** Stable court chip / confirm labels from name — never Prisma array order. */

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

export function toAsciiDigits(value: string): string {
  return String(value || '').replace(/[۰-۹]/g, (digit) => {
    const idx = PERSIAN_DIGITS.indexOf(digit)
    return idx >= 0 ? String(idx) : digit
  })
}

/**
 * Extract court ordinal from names like «زمین 1», «زمین ۳ غیر استاندارد», «Court 2».
 * Returns null when no positive integer is found.
 */
export function courtOrdinalFromName(nameFa: string, nameEn?: string | null): number | null {
  const fa = toAsciiDigits(nameFa || '')
  const en = String(nameEn || '')
  const match = fa.match(/(?:زمین)\s*(\d+)/i)
    || en.match(/(?:court)\s*(\d+)/i)
    || fa.match(/(\d+)/)
    || en.match(/(\d+)/)
  if (!match) return null
  const n = Number(match[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Chip / «زمین {n}» number: prefer name ordinal, else 1-based list index. */
export function courtDisplayNumber(
  court: { nameFa: string; nameEn?: string | null },
  fallbackIndex = 0,
): number {
  return courtOrdinalFromName(court.nameFa, court.nameEn) ?? (fallbackIndex + 1)
}

/** Sort courts 1, 2, 3… regardless of DB / include order. */
export function sortCourtsByOrdinal<T extends { nameFa: string; nameEn?: string | null; id?: string }>(
  courts: T[],
): T[] {
  return [...courts].sort((a, b) => {
    const oa = courtOrdinalFromName(a.nameFa, a.nameEn) ?? Number.MAX_SAFE_INTEGER
    const ob = courtOrdinalFromName(b.nameFa, b.nameEn) ?? Number.MAX_SAFE_INTEGER
    if (oa !== ob) return oa - ob
    const byName = a.nameFa.localeCompare(b.nameFa, 'fa')
    if (byName) return byName
    return String(a.id || '').localeCompare(String(b.id || ''))
  })
}
