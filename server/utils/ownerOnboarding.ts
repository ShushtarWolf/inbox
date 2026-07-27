/** Shared owner-registration helpers for password + OTP signup. */

export type OwnerRegisterSport = 'padel' | 'tennis' | 'both'

export function normalizeOwnerSport(raw?: string): OwnerRegisterSport {
  if (raw === 'tennis') return 'tennis'
  if (raw === 'both') return 'both'
  return 'padel'
}

/** Canva options: ۱ / ۲ / بالای ۲ → create up to 3 courts. */
export function normalizeOwnerCourtCount(raw?: number | string) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(Math.floor(n), 3)
}

export function sportSlugsForOwner(sport: OwnerRegisterSport): Array<'padel' | 'tennis'> {
  if (sport === 'tennis') return ['tennis']
  if (sport === 'both') return ['padel', 'tennis']
  return ['padel']
}

/** When sport=both but only one court was created, stage the second sport in setup. */
export function ownerSetupHandoff(sport: OwnerRegisterSport, courtCount: number): 'sport-both' | null {
  return sport === 'both' && courtCount < 2 ? 'sport-both' : null
}
