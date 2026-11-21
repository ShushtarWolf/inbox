/** Owner rules / notes shown to athletes on club booking (nullable, optional). */
export const COURT_DESCRIPTION_MAX = 2000

export type CourtDescriptionError = 'invalid' | 'too_long'

export function normalizeCourtDescription(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'string') {
    throw new Error('Invalid court description')
  }
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.length > COURT_DESCRIPTION_MAX) {
    throw new Error('Court description too long')
  }
  return trimmed
}

/** Client-safe parse — never throws. */
export function parseCourtDescriptionInput(
  raw: unknown,
): { ok: true; value: string | null } | { ok: false; error: CourtDescriptionError } {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: true, value: null }
  }
  if (typeof raw !== 'string') return { ok: false, error: 'invalid' }
  const trimmed = raw.trim()
  if (!trimmed) return { ok: true, value: null }
  if (trimmed.length > COURT_DESCRIPTION_MAX) return { ok: false, error: 'too_long' }
  return { ok: true, value: trimmed }
}