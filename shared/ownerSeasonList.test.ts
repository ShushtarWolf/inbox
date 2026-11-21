import { describe, expect, it } from 'vitest'
import {
  OWNER_SEASON_LIST_DEFAULT_LIMIT,
  OWNER_SEASON_LIST_MAX_LIMIT,
  compareOwnerSeasonListRows,
  parseOwnerSeasonListLimit,
  type OwnerSeasonListSortRow,
} from './ownerSeasonList.ts'

function sortRows(rows: OwnerSeasonListSortRow[]): OwnerSeasonListSortRow[] {
  return [...rows].sort(compareOwnerSeasonListRows)
}

describe('parseOwnerSeasonListLimit', () => {
  it('defaults when missing or invalid', () => {
    expect(parseOwnerSeasonListLimit(undefined)).toBe(OWNER_SEASON_LIST_DEFAULT_LIMIT)
    expect(parseOwnerSeasonListLimit('')).toBe(OWNER_SEASON_LIST_DEFAULT_LIMIT)
    expect(parseOwnerSeasonListLimit(0)).toBe(OWNER_SEASON_LIST_DEFAULT_LIMIT)
    expect(parseOwnerSeasonListLimit(-1)).toBe(OWNER_SEASON_LIST_DEFAULT_LIMIT)
  })

  it('caps at max', () => {
    expect(parseOwnerSeasonListLimit(50)).toBe(50)
    expect(parseOwnerSeasonListLimit(OWNER_SEASON_LIST_MAX_LIMIT + 99)).toBe(OWNER_SEASON_LIST_MAX_LIMIT)
  })
})

describe('compareOwnerSeasonListRows', () => {
  const d = (iso: string) => new Date(iso)
  const row = (
    partial: Partial<OwnerSeasonListSortRow> & Pick<OwnerSeasonListSortRow, 'cancelledAt'>,
  ): OwnerSeasonListSortRow => ({
    finishDate: d('2026-06-01'),
    startDate: d('2026-01-01'),
    createdAt: d('2026-01-01T10:00:00Z'),
    ...partial,
  })

  it('lists active (null cancelledAt) before cancelled rows', () => {
    const active = row({ cancelledAt: null, finishDate: d('2025-12-01') })
    const cancelled = row({
      cancelledAt: d('2026-03-01'),
      finishDate: d('2027-12-01'),
    })
    expect(sortRows([cancelled, active])).toEqual([active, cancelled])
  })

  it('orders by finishDate desc then startDate desc among active rows', () => {
    const laterFinish = row({
      cancelledAt: null,
      finishDate: d('2026-09-01'),
      startDate: d('2026-02-01'),
    })
    const earlierFinish = row({
      cancelledAt: null,
      finishDate: d('2026-06-01'),
      startDate: d('2026-05-01'),
    })
    const sameFinishLaterStart = row({
      cancelledAt: null,
      finishDate: d('2026-06-01'),
      startDate: d('2026-04-01'),
    })
    expect(sortRows([earlierFinish, laterFinish, sameFinishLaterStart])).toEqual([
      laterFinish,
      earlierFinish,
      sameFinishLaterStart,
    ])
  })

  it('orders cancelled rows by cancelledAt asc after all active rows', () => {
    const active = row({ cancelledAt: null })
    const cancelledEarly = row({ cancelledAt: d('2026-02-01') })
    const cancelledLate = row({ cancelledAt: d('2026-04-01') })
    expect(sortRows([cancelledLate, active, cancelledEarly])).toEqual([
      active,
      cancelledEarly,
      cancelledLate,
    ])
  })
})