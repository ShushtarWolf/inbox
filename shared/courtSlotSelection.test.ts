import { describe, expect, it } from 'vitest'
import {
  bookedGuestKey,
  checkedBookedSlots,
  courtIdsFromSlots,
  deskReserveSelectionIssue,
  isCancellableBookedSlot,
  joinWithAnd,
  siblingBookedSlots,
  slotCourtId,
  sortSlotsByTimeThenCourt,
  timesFromSlots,
  toggleBookedSlotSelection,
  toggleHourOnCourts,
  toggleId,
  uniqueOrdered,
} from './courtSlotSelection.ts'

const c2 = 'court-2'
const c4 = 'court-4'
const c5 = 'court-5'

function slot(id: string, courtId: string, startTime: string, displayStatus = 'FREE') {
  return { id, courtId, startTime, displayStatus }
}

describe('toggleId', () => {
  it('adds and removes without touching other ids', () => {
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b'])
  })
})

describe('joinWithAnd', () => {
  it('joins Persian lists', () => {
    expect(joinWithAnd(['زمین ۲'])).toBe('زمین ۲')
    expect(joinWithAnd(['زمین ۲', 'زمین ۴'])).toBe('زمین ۲ و زمین ۴')
    expect(joinWithAnd(['زمین ۲', 'زمین ۴', 'زمین ۵'])).toBe('زمین ۲، زمین ۴ و زمین ۵')
  })
})

describe('toggleHourOnCourts', () => {
  const slots = [
    slot('s2-16', c2, '16:00'),
    slot('s2-17', c2, '17:00'),
    slot('s4-16', c4, '16:00'),
    slot('s4-17', c4, '17:00', 'RESERVED'),
    slot('s5-16', c5, '16:00'),
    slot('s5-17', c5, '17:00'),
  ]

  it('toggles a single court hour (same-court multi-hour still works)', () => {
    const one = toggleHourOnCourts({
      selectedSlotIds: [],
      selectedCourtIds: [c2],
      startTime: '16:00',
      slots,
    })
    expect(one).toEqual(['s2-16'])
    const two = toggleHourOnCourts({
      selectedSlotIds: one,
      selectedCourtIds: [c2],
      startTime: '17:00',
      slots,
    })
    expect(two).toEqual(['s2-16', 's2-17'])
  })

  it('adds the same hour on every selected FREE court', () => {
    const next = toggleHourOnCourts({
      selectedSlotIds: [],
      selectedCourtIds: [c4, c5],
      startTime: '16:00',
      slots,
    })
    expect(next.sort()).toEqual(['s4-16', 's5-16'])
  })

  it('skips booked courts and does not fail the whole pick', () => {
    const next = toggleHourOnCourts({
      selectedSlotIds: [],
      selectedCourtIds: [c4, c5],
      startTime: '17:00',
      slots,
    })
    expect(next).toEqual(['s5-17'])
  })

  it('does not clear another court’s already-picked slots', () => {
    const next = toggleHourOnCourts({
      selectedSlotIds: ['s2-16'],
      selectedCourtIds: [c5],
      startTime: '17:00',
      slots,
    })
    expect(next.sort()).toEqual(['s2-16', 's5-17'])
  })

  it('toggles the hour off all selected courts when all are already on', () => {
    const next = toggleHourOnCourts({
      selectedSlotIds: ['s4-16', 's5-16', 's2-16'],
      selectedCourtIds: [c4, c5],
      startTime: '16:00',
      slots,
    })
    expect(next).toEqual(['s2-16'])
  })
})

describe('deskReserveSelectionIssue', () => {
  it('flags a past FREE slot before a taken one', () => {
    expect(deskReserveSelectionIssue(
      [{ displayStatus: 'FREE' }],
      () => true,
    )).toBe('past')
    expect(deskReserveSelectionIssue(
      [{ displayStatus: 'FREE' }, { displayStatus: 'BLOCKED' }],
      (slot) => slot.displayStatus === 'FREE',
    )).toBe('past')
  })

  it('flags a selected slot that is no longer FREE', () => {
    expect(deskReserveSelectionIssue(
      [{ displayStatus: 'RESERVED' }],
      () => false,
    )).toBe('unavailable')
    expect(deskReserveSelectionIssue(
      [{ displayStatus: 'BLOCKED' }],
      () => false,
    )).toBe('unavailable')
  })

  it('returns null when every selected slot is still bookable', () => {
    expect(deskReserveSelectionIssue(
      [{ displayStatus: 'FREE' }],
      () => false,
    )).toBeNull()
    expect(deskReserveSelectionIssue([], () => false)).toBeNull()
  })
})

describe('slot summaries', () => {
  it('collects unique courts and times in order', () => {
    const picked = [
      slot('a', c2, '16:00'),
      slot('b', c4, '16:00'),
      slot('c', c2, '17:00'),
    ]
    expect(courtIdsFromSlots(picked)).toEqual([c2, c4])
    expect(timesFromSlots(picked)).toEqual(['16:00', '17:00'])
  })

  it('sorts by time then court order', () => {
    const sorted = sortSlotsByTimeThenCourt(
      [slot('b', c5, '08:00'), slot('a', c2, '08:00'), slot('c', c2, '09:00')],
      [c2, c5],
    )
    expect(sorted.map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('uniqueOrdered keeps first occurrence', () => {
    expect(uniqueOrdered(['a', 'b', 'a'])).toEqual(['a', 'b'])
    expect(slotCourtId({ court: { id: 'x' } })).toBe('x')
  })
})

describe('siblingBookedSlots', () => {
  const guestA = { status: 'CONFIRMED', guestMobile: '09120000001', guestName: 'علی', guestFamily: 'محمدی' }
  const guestAAltName = { status: 'CONFIRMED', guestMobile: '+989120000001', guestName: 'Ali', guestFamily: 'X' }
  const guestB = { status: 'CONFIRMED', guestMobile: '09120000002', guestName: 'سارا', guestFamily: 'رضایی' }
  const guestNameOnly = { status: 'CONFIRMED', guestMobile: '', guestName: 'مینا', guestFamily: 'کریمی' }

  function booked(
    id: string,
    startTime: string,
    opts: {
      courtId?: string
      date?: string
      displayStatus?: string
      booking?: typeof guestA | null
    } = {},
  ) {
    return {
      id,
      courtId: opts.courtId || c2,
      startTime,
      date: opts.date ?? '2026-08-18',
      displayStatus: opts.displayStatus ?? 'RESERVED',
      booking: opts.booking === undefined ? guestA : opts.booking,
    }
  }

  it('groups same-date hours for the same mobile, including other courts', () => {
    const nine = booked('s-09', '09:00')
    const tenOtherCourt = booked('s-10', '10:00', { courtId: c4 })
    const slots = [
      tenOtherCourt,
      nine,
      booked('other-guest', '11:00', { booking: guestB }),
      booked('other-day', '12:00', { date: '2026-08-19' }),
      booked('blocked', '13:00', { displayStatus: 'BLOCKED' }),
      booked('free', '14:00', { displayStatus: 'FREE', booking: null }),
    ]
    expect(siblingBookedSlots(slots, nine, [c2, c4]).map((s) => s.id)).toEqual(['s-09', 's-10'])
  })

  it('prefers guestMobile even when names differ, and normalizes +98 vs 09', () => {
    const nine = booked('s-09', '09:00')
    const ten = booked('s-10', '10:00', { booking: guestAAltName })
    expect(siblingBookedSlots([nine, ten], nine).map((s) => s.id)).toEqual(['s-09', 's-10'])
  })

  it('falls back to name+family when mobile is empty', () => {
    const nine = booked('s-09', '09:00', { booking: guestNameOnly })
    const ten = booked('s-10', '10:00', { booking: { ...guestNameOnly } })
    const other = booked('s-11', '11:00', { booking: { ...guestNameOnly, guestFamily: 'دیگر' } })
    expect(siblingBookedSlots([nine, ten, other], nine).map((s) => s.id)).toEqual(['s-09', 's-10'])
  })

  it('does not group empty identities together', () => {
    const empty = { status: 'CONFIRMED', guestMobile: '', guestName: '', guestFamily: '' }
    const nine = booked('s-09', '09:00', { booking: empty })
    const ten = booked('s-10', '10:00', { booking: empty })
    expect(siblingBookedSlots([nine, ten], nine).map((s) => s.id)).toEqual(['s-09'])
  })

  it('returns only the tapped hour when there are no siblings', () => {
    const nine = booked('s-09', '09:00')
    expect(siblingBookedSlots([nine], nine).map((s) => s.id)).toEqual(['s-09'])
  })

  it('excludes CANCELLED, PUBLIC, CLOSED and returns nothing for a non-booked anchor', () => {
    const cancelled = booked('s-09', '09:00', { booking: { ...guestA, status: 'CANCELLED' } })
    const publicSlot = booked('s-10', '10:00', { displayStatus: 'PUBLIC' })
    const closed = booked('s-11', '11:00', { displayStatus: 'CLOSED' })
    expect(siblingBookedSlots([cancelled, publicSlot, closed], cancelled)).toEqual([])
    expect(isCancellableBookedSlot(publicSlot)).toBe(false)
    expect(isCancellableBookedSlot(booked('p', '09:00', { displayStatus: 'PENDING' }))).toBe(true)
  })

  it('includes PENDING siblings with RESERVED hours', () => {
    const reserved = booked('s-09', '09:00')
    const pending = booked('s-10', '10:00', { displayStatus: 'PENDING' })
    expect(siblingBookedSlots([reserved, pending], reserved).map((s) => s.id)).toEqual(['s-09', 's-10'])
  })
})

describe('toggleBookedSlotSelection', () => {
  const siblings = [
    { id: 's-09', displayStatus: 'RESERVED', booking: { status: 'CONFIRMED' } },
    { id: 's-10', displayStatus: 'RESERVED', booking: { status: 'CONFIRMED' } },
  ]
  const allowed = siblings.map((s) => s.id)

  it('unchecking one hour leaves the other checked for cancel', () => {
    let selected = ['s-09', 's-10']
    selected = toggleBookedSlotSelection(selected, 's-10', allowed)
    expect(checkedBookedSlots(siblings, selected).map((s) => s.id)).toEqual(['s-09'])
    selected = toggleBookedSlotSelection(selected, 's-09', allowed)
    expect(checkedBookedSlots(siblings, selected)).toEqual([])
  })

  it('ignores ids outside the sibling set (does not mix another guest)', () => {
    expect(toggleBookedSlotSelection(['s-09'], 'other', allowed)).toEqual(['s-09'])
  })

  it('bookedGuestKey is empty for cancelled bookings', () => {
    expect(bookedGuestKey({ status: 'CANCELLED', guestMobile: '09120000001' })).toBe('')
  })
})
