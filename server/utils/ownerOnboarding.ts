/** Shared owner-registration helpers for password + OTP signup. */

export type OwnerRegisterSport = 'padel' | 'tennis' | 'both'

export function normalizeOwnerSport(raw?: string): OwnerRegisterSport {
  if (raw === 'tennis') return 'tennis'
  if (raw === 'both') return 'both'
  return 'padel'
}

/** Signup seeds no courts: owners add their real courts in setup (seeded defaults were phantom courts). */
export function normalizeOwnerCourtCount(_raw?: number | string, _sport?: OwnerRegisterSport) {
  return 0
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
