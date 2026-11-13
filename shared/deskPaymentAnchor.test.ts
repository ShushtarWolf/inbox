import { describe, expect, it } from 'vitest'
import { deskPaymentAnchorSlot } from './deskPaymentAnchor.ts'

describe('deskPaymentAnchorSlot', () => {
  const freeA = { id: 'a', displayStatus: 'FREE' as const }
  const freeB = { id: 'b', displayStatus: 'FREE' as const }
  const reserved = {
    id: 'old',
    displayStatus: 'RESERVED',
    booking: { status: 'CONFIRMED', payment: { method: 'IPG', status: 'PAY_AT_CLUB' } },
  }

  it('uses the selected slot when it is part of a new free reserve', () => {
    expect(deskPaymentAnchorSlot(freeB, [freeA, freeB], true)?.id).toBe('b')
  })

  it('drops a stale occupied selectedSlot when reserving other free hours', () => {
    expect(deskPaymentAnchorSlot(reserved, [freeA, freeB], true)?.id).toBe('a')
  })

  it('keeps the occupied selected slot when editing an existing booking', () => {
    expect(deskPaymentAnchorSlot(reserved, [freeA], false)?.id).toBe('old')
  })
})
