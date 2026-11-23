import { describe, expect, it } from 'vitest'
import {
  blocksFreeSlotWhenBookedSelect,
  shouldExitBookedSelectForFreeSlot,
  toggleFreeSlotIdInSelection,
} from './ownerCalendarSelection.ts'

describe('ownerCalendarSelection', () => {
  it('flags FREE taps that should exit booked-select mode instead of blocking', () => {
    expect(shouldExitBookedSelectForFreeSlot(true, 'FREE')).toBe(true)
    expect(shouldExitBookedSelectForFreeSlot(true, null)).toBe(true)
    expect(shouldExitBookedSelectForFreeSlot(false, 'FREE')).toBe(false)
    expect(shouldExitBookedSelectForFreeSlot(true, 'RESERVED')).toBe(false)
    expect(shouldExitBookedSelectForFreeSlot(true, 'BLOCKED')).toBe(false)
  })

  it('documents the previous stuck guard (regression)', () => {
    expect(blocksFreeSlotWhenBookedSelect(true, 'FREE')).toBe(true)
    expect(blocksFreeSlotWhenBookedSelect(false, 'FREE')).toBe(false)
  })

  it('toggleFreeSlotIdInSelection adds across courts then survives a clear+re-pick flow', () => {
    let ids = toggleFreeSlotIdInSelection([], 'court1-22:00', 'FREE')
    ids = toggleFreeSlotIdInSelection(ids, 'court2-22:00', 'FREE')
    expect(ids).toEqual(['court1-22:00', 'court2-22:00'])
    ids = []
    ids = toggleFreeSlotIdInSelection(ids, 'court3-22:00', 'FREE')
    ids = toggleFreeSlotIdInSelection(ids, 'court1-22:00', 'FREE')
    ids = toggleFreeSlotIdInSelection(ids, 'court2-22:00', 'FREE')
    expect(ids).toHaveLength(3)
  })
})