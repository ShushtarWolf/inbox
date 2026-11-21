/** Owner calendar «رزرو فصلی» tab: list page size and cap (GET /api/owner/seasons). */
export const OWNER_SEASON_LIST_DEFAULT_LIMIT = 200
export const OWNER_SEASON_LIST_MAX_LIMIT = 500

export function parseOwnerSeasonListLimit(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return OWNER_SEASON_LIST_DEFAULT_LIMIT
  return Math.min(Math.floor(n), OWNER_SEASON_LIST_MAX_LIMIT)
}

/** Prefer ongoing/active seasons in the tab; avoid hiding long-running rows after many new creates. */
export const ownerSeasonListOrderBy = [
  { cancelledAt: 'asc' as const },
  { finishDate: 'desc' as const },
  { startDate: 'desc' as const },
  { createdAt: 'desc' as const },
]