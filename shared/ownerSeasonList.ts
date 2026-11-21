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
  { cancelledAt: { sort: 'asc' as const, nulls: 'first' as const } },
  { finishDate: 'desc' as const },
  { startDate: 'desc' as const },
  { createdAt: 'desc' as const },
]

export type OwnerSeasonListSortRow = {
  cancelledAt: Date | null
  finishDate: Date
  startDate: Date
  createdAt: Date
}

/** Mirrors Prisma `ownerSeasonListOrderBy` for unit tests and client-side previews. */
export function compareOwnerSeasonListRows(
  a: OwnerSeasonListSortRow,
  b: OwnerSeasonListSortRow,
): number {
  if (a.cancelledAt === null && b.cancelledAt !== null) return -1
  if (a.cancelledAt !== null && b.cancelledAt === null) return 1
  if (a.cancelledAt !== null && b.cancelledAt !== null) {
    const byCancel = a.cancelledAt.getTime() - b.cancelledAt.getTime()
    if (byCancel !== 0) return byCancel
  }
  const byFinish = b.finishDate.getTime() - a.finishDate.getTime()
  if (byFinish !== 0) return byFinish
  const byStart = b.startDate.getTime() - a.startDate.getTime()
  if (byStart !== 0) return byStart
  return b.createdAt.getTime() - a.createdAt.getTime()
}