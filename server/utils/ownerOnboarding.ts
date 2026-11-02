/** Shared owner-registration helpers for password + OTP signup. */

export type OwnerRegisterSport = 'padel' | 'tennis' | 'both'

export function normalizeOwnerSport(raw?: string): OwnerRegisterSport {
  if (raw === 'tennis') return 'tennis'
  if (raw === 'both') return 'both'
  return 'padel'
}

/**
 * Signup seeds only one placeholder court per chosen sport (padel/tennis → 1, both → 2).
 * Owners add their real courts in setup; seeding 3 left phantom courts they could not clear.
 */
export function normalizeOwnerCourtCount(_raw?: number | string, sport: OwnerRegisterSport = 'padel') {
  return sport === 'both' ? 2 : 1
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
