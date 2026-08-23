/** Collapse legacy double-prefix paths (`/uploads/uploads/…` → `/uploads/…`). */
export function normalizeUploadUrl(value: string) {
  return value.replace(/^\/uploads\/uploads\//, '/uploads/')
}

/** Club cover/gallery paths the owner settings PATCH may persist. */
export function isAllowedClubImageUrl(value: string) {
  const normalized = normalizeUploadUrl(value)
  return /^https?:\/\/.+/i.test(normalized)
    || normalized.startsWith('/uploads/')
    || normalized.startsWith('/media/')
    || normalized.startsWith('/demo/')
    || normalized.startsWith('/placeholders/')
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
  const trimmed = String(raw).trim()
  if (!trimmed) return { ok: true, value: null }
  const value = normalizeUploadUrl(trimmed)
  if (!isAllowedClubImageUrl(value)) return { ok: false }
  return { ok: true, value }
}
