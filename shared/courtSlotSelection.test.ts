import { describe, expect, it } from 'vitest'
import {
  courtIdsFromSlots,
  deskReserveSelectionIssue,
  joinWithAnd,
  slotCourtId,
  sortSlotsByTimeThenCourt,
  timesFromSlots,
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
