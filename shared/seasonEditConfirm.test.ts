import { describe, expect, it } from 'vitest'
import { seasonConfirmChargeSubtotal, seasonEditSaveOnly } from './seasonEditConfirm'

describe('seasonConfirmChargeSubtotal', () => {
  it('uses full subtotal in create mode', () => {
    expect(seasonConfirmChargeSubtotal({ editingSeasonId: false, editAddedAmount: 0, createSubtotal: 288_000 })).toBe(288_000)
  })

  it('uses added amount only in edit mode', () => {
    expect(seasonConfirmChargeSubtotal({ editingSeasonId: true, editAddedAmount: 24_000, createSubtotal: 288_000 })).toBe(24_000)
    expect(seasonConfirmChargeSubtotal({ editingSeasonId: true, editAddedAmount: 0, createSubtotal: 288_000 })).toBe(0)
  })
})

describe('seasonEditSaveOnly', () => {
  it('is true when editing with no added sessions', () => {
    expect(seasonEditSaveOnly({ editingSeasonId: true, addedCount: 0 })).toBe(true)
    expect(seasonEditSaveOnly({ editingSeasonId: true, addedCount: 2 })).toBe(false)
    expect(seasonEditSaveOnly({ editingSeasonId: false, addedCount: 0 })).toBe(false)
  })
})