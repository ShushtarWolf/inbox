import { describe, expect, it } from 'vitest'
import {
  availableEquipmentQty,
  minAvailableEquipmentAcrossTimes,
  normalizeSlotTime,
  sumBookedEquipmentFromSlots,
  type SlotEquipmentSnapshot,
} from '#shared/equipmentAvailability.ts'

describe('normalizeSlotTime', () => {
  it('normalizes HH:MM:SS to HH:MM', () => {
    expect(normalizeSlotTime('17:00:00')).toBe('17:00')
    expect(normalizeSlotTime('9:30')).toBe('09:30')
  })

  it('coerces bare hour numbers and strings to HH:00', () => {
    expect(normalizeSlotTime(10)).toBe('10:00')
    expect(normalizeSlotTime('10')).toBe('10:00')
    expect(normalizeSlotTime(8)).toBe('08:00')
  })
})

describe('sumBookedEquipmentFromSlots', () => {
  const slots: SlotEquipmentSnapshot[] = [
    {
      date: '2026-08-24',
      startTime: '17:00',
      booking: {
        id: 'b1',
        status: 'CONFIRMED',
        bookingEquipments: [{ equipmentId: 'racket', quantity: 3 }],
      },
    },
    {
      date: '2026-08-24',
      startTime: '17:00',
      booking: {
        id: 'b2',
        status: 'CONFIRMED',
        bookingEquipments: [{ equipmentId: 'racket', quantity: 2 }],
      },
    },
    {
      date: '2026-08-24',
      startTime: '18:00',
      booking: {
        id: 'b3',
        status: 'CONFIRMED',
        bookingEquipments: [{ equipmentId: 'racket', quantity: 4 }],
      },
    },
    {
      date: '2026-08-24',
      startTime: '17:00',
      booking: {
        id: 'b4',
        status: 'CANCELLED',
        bookingEquipments: [{ equipmentId: 'racket', quantity: 10 }],
      },
    },
  ]

  it('sums bookings at the same hour across courts', () => {
    expect(sumBookedEquipmentFromSlots(slots, 'racket', '2026-08-24', '17:00')).toBe(5)
  })

  it('ignores other hours', () => {
    expect(sumBookedEquipmentFromSlots(slots, 'racket', '2026-08-24', '18:00')).toBe(4)
  })

  it('excludes a booking being edited', () => {
    expect(sumBookedEquipmentFromSlots(slots, 'racket', '2026-08-24', '17:00', 'b1')).toBe(2)
  })
})

describe('availableEquipmentQty', () => {
  it('subtracts booked units from stock', () => {
    expect(availableEquipmentQty(7, 5)).toBe(2)
    expect(availableEquipmentQty(7, 8)).toBe(0)
  })
})

describe('minAvailableEquipmentAcrossTimes', () => {
  const slots: SlotEquipmentSnapshot[] = [
    {
      date: '2026-08-24',
      startTime: '17:00',
      booking: {
        id: 'b1',
        status: 'CONFIRMED',
        bookingEquipments: [{ equipmentId: 'racket', quantity: 6 }],
      },
    },
    {
      date: '2026-08-24',
      startTime: '18:00',
      booking: {
        id: 'b2',
        status: 'CONFIRMED',
        bookingEquipments: [{ equipmentId: 'racket', quantity: 2 }],
      },
    },
  ]

  it('returns the strictest availability across selected times', () => {
    expect(minAvailableEquipmentAcrossTimes(
      slots,
      'racket',
      '2026-08-24',
      ['17:00', '18:00'],
      7,
    )).toBe(1)
  })
})
