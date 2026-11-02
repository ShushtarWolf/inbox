import { describe, expect, it } from 'vitest'
import { planBookingGuestFamilyBackfill } from './bookingGuestBackfill.ts'

describe('planBookingGuestFamilyBackfill', () => {
  it('splits legacy full name stored only in guestName', () => {
    expect(planBookingGuestFamilyBackfill({
      guestName: 'علی محمدی',
      guestFamily: null,
    })).toEqual({
      guestName: 'علی',
      guestFamily: 'محمدی',
      reason: 'split_guest_name',
    })
  })

  it('restores family from linked user when guest first name matches', () => {
    expect(planBookingGuestFamilyBackfill({
      guestName: 'الهه',
      guestFamily: '',
      user: { name: 'الهه', nameFamily: 'ربیعی' },
    })).toEqual({
      guestName: 'الهه',
      guestFamily: 'ربیعی',
      reason: 'from_linked_user',
    })
  })

  it('does not copy user family when desk guest first name differs', () => {
    expect(planBookingGuestFamilyBackfill({
      guestName: 'مهمان',
      guestFamily: null,
      user: { name: 'الهه', nameFamily: 'ربیعی' },
    })).toBeNull()
  })

  it('skips when guestFamily already set', () => {
    expect(planBookingGuestFamilyBackfill({
      guestName: 'علی',
      guestFamily: 'محمدی',
    })).toBeNull()
  })

  it('splits multi-token given names in guestName', () => {
    expect(planBookingGuestFamilyBackfill({
      guestName: 'سید حمید رضا افقه',
      guestFamily: null,
    })).toEqual({
      guestName: 'سید',
      guestFamily: 'حمید رضا افقه',
      reason: 'split_guest_name',
    })
  })
})
