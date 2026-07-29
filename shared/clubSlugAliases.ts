/**
 * Public slug aliases for renamed / re-provisioned clubs.
 * Old URLs soft-resolve to the canonical slug instead of a blank error.
 */
export const CLUB_SLUG_ALIASES: Record<string, string> = {
  'club-9208f4': 'iust-tennis',
}

export function resolveClubSlugAlias(slug: string): string {
  const key = String(slug || '').trim()
  if (!key) return key
  return CLUB_SLUG_ALIASES[key] || key
}
