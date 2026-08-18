/** Club cover/gallery paths the owner settings PATCH may persist. */
export function isAllowedClubImageUrl(value: string) {
  return /^https?:\/\/.+/i.test(value)
    || value.startsWith('/uploads/')
    || value.startsWith('/media/')
    || value.startsWith('/demo/')
    || value.startsWith('/placeholders/')
}

export type ClubImageParseResult =
  | { ok: true, value: string | null }
  | { ok: false }

/**
 * Empty / whitespace clears the stored image.
 * Allowed: http(s), /uploads/, /media/, /demo/, /placeholders/.
 */
export function parseClubImageInput(raw: string | null | undefined): ClubImageParseResult {
  if (raw == null) return { ok: true, value: null }
  const value = String(raw).trim()
  if (!value) return { ok: true, value: null }
  if (!isAllowedClubImageUrl(value)) return { ok: false }
  return { ok: true, value }
}
