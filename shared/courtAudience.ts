import type { GenderValue } from './gender.ts'

/** Who may book / use a court. MIXED = no gender restriction (legacy default). */
export type CourtAudience = 'MIXED' | 'MEN' | 'WOMEN' | 'FAMILY'

export const COURT_AUDIENCE_VALUES: CourtAudience[] = ['MIXED', 'MEN', 'WOMEN', 'FAMILY']

/** Owner court form: men / women toggles only (maps to stored enum). */
export const COURT_AUDIENCE_UI_SEGMENTS = ['MEN', 'WOMEN'] as const
export type CourtAudienceUiSegment = (typeof COURT_AUDIENCE_UI_SEGMENTS)[number]

export type CourtAudienceSelection = { men: boolean; women: boolean }

export type CourtAudienceDisplayKey = CourtAudienceUiSegment | 'MEN_AND_WOMEN'

export function parseCourtAudience(raw: unknown): CourtAudience | null {
  if (raw === 'MIXED' || raw === 'MEN' || raw === 'WOMEN' || raw === 'FAMILY') return raw
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (trimmed === 'عمومی') return 'MIXED'
  const normalized = trimmed.toUpperCase()
  if (normalized === 'MIXED' || normalized === 'OPEN' || normalized === 'ALL' || normalized === 'PUBLIC') return 'MIXED'
  if (normalized === 'MEN' || normalized === 'MALE' || normalized === 'آقایان') return 'MEN'
  if (normalized === 'WOMEN' || normalized === 'FEMALE' || normalized === 'بانوان') return 'WOMEN'
  if (normalized === 'FAMILY' || normalized === 'خانوادگی') return 'FAMILY'
  return null
}

/** Map stored enum → owner UI toggles (MIXED / FAMILY / legacy «عمومی» = both on). */
export function courtAudienceToSelection(audience: CourtAudience | null | undefined): CourtAudienceSelection {
  const policy = audience || 'MIXED'
  if (policy === 'MEN') return { men: true, women: false }
  if (policy === 'WOMEN') return { men: false, women: true }
  return { men: true, women: true }
}

/** Map owner toggles → stored enum; null when neither is selected. */
export function selectionToCourtAudience(selection: CourtAudienceSelection): CourtAudience | null {
  const { men, women } = selection
  if (men && women) return 'MIXED'
  if (men) return 'MEN'
  if (women) return 'WOMEN'
  return null
}

/** i18n key suffix under `*.audience.*` for list / booking chips. */
export function courtAudienceDisplayKey(audience: CourtAudience | null | undefined): CourtAudienceDisplayKey {
  const policy = audience || 'MIXED'
  if (policy === 'MEN') return 'MEN'
  if (policy === 'WOMEN') return 'WOMEN'
  return 'MEN_AND_WOMEN'
}

/** True when this audience should show a public chip (not the quiet MIXED default). */
export function courtAudienceShowsTag(audience: CourtAudience | null | undefined): boolean {
  return true
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

/** First gender-policy violation across a multi-court basket (chips + slot courts). */
export function firstAudienceBlockForCourtIds(
  courtIds: string[],
  audienceForCourtId: (courtId: string) => CourtAudience | null | undefined,
  gender: GenderValue | null | undefined,
): CourtAudienceBlockReason {
  for (const id of courtIds) {
    const reason = courtAudienceBlockReason(audienceForCourtId(id), gender)
    if (reason) return reason
  }
  return null
}

/** MEN/WOMEN policies present in the basket — for confirm-sheet / banner copy. */
export function restrictedAudiencesInBasket(
  courtIds: string[],
  audienceForCourtId: (courtId: string) => CourtAudience | null | undefined,
): CourtAudience[] {
  const found = new Set<CourtAudience>()
  for (const id of courtIds) {
    const policy = audienceForCourtId(id) || 'MIXED'
    if (policy === 'MEN' || policy === 'WOMEN') found.add(policy)
  }
  return [...found]
}
