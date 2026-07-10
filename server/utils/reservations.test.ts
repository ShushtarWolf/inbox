import { describe, expect, it } from 'vitest'
import { canManageReservation } from './reservations'

describe('canManageReservation', () => {
  it('allows cancel when outside cancellation window', () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 7)
    const date = futureDate.toISOString().slice(0, 10)
    expect(canManageReservation(date, '20:00', 12)).toBe(true)
  })
})
