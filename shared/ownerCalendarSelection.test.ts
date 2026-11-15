import { describe, expect, it } from 'vitest'
import {
  blocksFreeSlotWhenBookedSelect,
  shouldExitBookedSelectForFreeSlot,
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
})