import { toAsciiDigits } from '#shared/digits.ts'
import { normalizeIranPhone } from '#shared/phone.ts'

export type CoachStudentHit = { name: string; mobile: string }

/** Null when the query is too short to search. */
export function coachStudentQuery(raw: string): {
  q: string
  phoneContains: string
  exactPhone: string | null
} | null {
  const q = toAsciiDigits(raw).trim()
  if (q.length < 2) return null
  const digits = q.replace(/\D/g, '')
  let phoneContains = ''
  if (digits.length >= 3) {
    const national = digits.replace(/^0/, '')
    // `0912` should match both `09…` and `+989…` rows.
    phoneContains = national.length >= 3 ? national : digits
  }
  return {
    q,
    phoneContains,
    exactPhone: normalizeIranPhone(q),
  }
}

/** Past students first, then an exact phone hit this coach has never taught. Deduped by mobile. */
export function mergeCoachStudentHits(
  past: CoachStudentHit[],
  exact: CoachStudentHit | null,
  limit = 12,
): CoachStudentHit[] {
  const map = new Map<string, CoachStudentHit>()
  function add(hit: CoachStudentHit) {
    const name = hit.name.trim()
    const mobile = normalizeIranPhone(hit.mobile) || hit.mobile.trim()
    if (!name && !mobile) return
    const key = mobile || `name:${name.toLowerCase()}`
    const existing = map.get(key)
    if (!existing) {
      map.set(key, { name, mobile })
      return
    }
    if (!existing.name && name) existing.name = name
    if (!existing.mobile && mobile) existing.mobile = mobile
  }
  for (const hit of past) add(hit)
  if (exact) add(exact)
  return [...map.values()].slice(0, limit)
}
