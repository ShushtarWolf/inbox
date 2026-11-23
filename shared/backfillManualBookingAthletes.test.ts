import { describe, expect, it } from 'vitest'
import {
  groupOrphanBookingsByPhone,
  pickDeskGuestNameForBackfill,
  type OrphanGuestBooking,
} from './backfillManualBookingAthletes.ts'

function row(
  overrides: Partial<OrphanGuestBooking> & Pick<OrphanGuestBooking, 'id'>,
): OrphanGuestBooking {
  return {
    guestMobile: '09121234567',
    guestName: 'علی',
    guestFamily: 'احمدی',
    createdAt: new Date('2026-01-01'),
    ...overrides,
  }
}

describe('backfillManualBookingAthletes helpers', () => {
  it('picks the latest booking with a non-empty guest name', () => {
    const name = pickDeskGuestNameForBackfill([
      row({ id: 'a', guestName: 'قدیم', createdAt: new Date('2026-01-01') }),
      row({ id: 'b', guestName: 'جدید', guestFamily: 'نام', createdAt: new Date('2026-06-01') }),
    ])
    expect(name.name).toBe('جدید')
    expect(name.nameFamily).toBe('نام')
  })

  it('groups bookings by normalized phone', () => {
    const groups = groupOrphanBookingsByPhone([
      row({ id: 'a', guestMobile: '+98 912 123 4567' }),
      row({ id: 'b', guestMobile: '09121234567' }),
      row({ id: 'c', guestMobile: 'invalid' }),
    ])
    expect(groups.size).toBe(1)
    expect(groups.get('09121234567')?.map((r) => r.id)).toEqual(['a', 'b'])
  })
})