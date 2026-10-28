import type { GenderValue } from './gender.ts'

/** Who may book / use a court. MIXED = no gender restriction (legacy default). */
export type CourtAudience = 'MIXED' | 'MEN' | 'WOMEN' | 'FAMILY'

export const COURT_AUDIENCE_VALUES: CourtAudience[] = ['MIXED', 'MEN', 'WOMEN', 'FAMILY']

export function parseCourtAudience(raw: unknown): CourtAudience | null {
  if (raw === 'MIXED' || raw === 'MEN' || raw === 'WOMEN' || raw === 'FAMILY') return raw
  if (typeof raw !== 'string') return null
  const normalized = raw.trim().toUpperCase()
  if (normalized === 'MIXED' || normalized === 'OPEN' || normalized === 'ALL') return 'MIXED'
  if (normalized === 'MEN' || normalized === 'MALE' || normalized === 'آقایان') return 'MEN'
  if (normalized === 'WOMEN' || normalized === 'FEMALE' || normalized === 'بانوان') return 'WOMEN'
  if (normalized === 'FAMILY' || normalized === 'خانوادگی') return 'FAMILY'
  return null
}

/** True when this audience should show a public chip (not the quiet MIXED default). */
export function courtAudienceShowsTag(audience: CourtAudience | null | undefined): boolean {
  return audience === 'MEN' || audience === 'WOMEN' || audience === 'FAMILY'
}

/**
 * Whether a booker's gender may reserve this court.
 * MIXED/FAMILY: anyone (including unknown gender).
 * MEN/WOMEN: require matching gender; unknown gender is denied.
 */
export function courtAudienceAllowsGender(
  audience: CourtAudience | null | undefined,
  gender: GenderValue | null | undefined,
): boolean {
  const policy = audience || 'MIXED'
  if (policy === 'MIXED' || policy === 'FAMILY') return true
  if (!gender) return false
  if (policy === 'MEN') return gender === 'MALE'
  if (policy === 'WOMEN') return gender === 'FEMALE'
  return true
}

export type CourtAudienceBlockReason = 'gender_required' | 'men_only' | 'women_only' | null

export function courtAudienceBlockReason(
  audience: CourtAudience | null | undefined,
  gender: GenderValue | null | undefined,
): CourtAudienceBlockReason {
  const policy = audience || 'MIXED'
  if (policy === 'MIXED' || policy === 'FAMILY') return null
  if (!gender) return 'gender_required'
  if (policy === 'MEN' && gender !== 'MALE') return 'men_only'
  if (policy === 'WOMEN' && gender !== 'FEMALE') return 'women_only'
  return null
}
