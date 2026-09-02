import { describe, expect, it } from 'vitest'
import {
  isAloPlaySlotFree,
  parseAvailableTimePayload,
  suspectedOccupiedFromFreeSet,
  unionFreeSlots,
} from './aloplayParse'

/** Live 2026-08-30 clubId 10887, productGender=2 — court 3 (112282) free at 17/20/22. */
const maleAvailableTime = {
  data: [
    { fromTime: '17:00:00', toTime: '18:00:00', productId: 112282 },
    { fromTime: '20:00:00', toTime: '21:00:00', productId: 112282 },
    { fromTime: '22:00:00', toTime: '23:00:00', productId: 112282 },
  ],
  statusCode: 0,
  message: 'عملیات موفقیت آمیز',
} as const

/** GetByTime at 17:00 marks 112282 with remainedCapacity: 0 — must not drive occupancy. */
const byTimeWithZeroCapacity = {
  data: [
    { productId: 112282, remainedCapacity: 0 },
    { productId: 56921, remainedCapacity: 0 },
  ],
  statusCode: 0,
} as const

const court3Mapping = [{ courtKey: 'court-3', productId: 112282, starts: ['10:00', '17:00', '20:00'] }]
const allCourtsMapping = [
  { courtKey: 'court-1', productId: 56921, starts: ['10:00', '17:00'] },
  { courtKey: 'court-3', productId: 112282, starts: ['10:00', '17:00', '20:00'] },
]

describe('parseAvailableTimePayload', () => {
  it('builds free slots from fromTime + productId', () => {
    const { freeSlots, error } = parseAvailableTimePayload(maleAvailableTime)
    expect(error).toBeUndefined()
    expect(isAloPlaySlotFree(freeSlots, 112282, '17:00')).toBe(true)
    expect(isAloPlaySlotFree(freeSlots, 112282, '20:00')).toBe(true)
    expect(isAloPlaySlotFree(freeSlots, 112282, '22:00')).toBe(true)
    expect(isAloPlaySlotFree(freeSlots, 112282, '10:00')).toBe(false)
  })

  it('treats valid empty data as no free slots at parse time (adapter rejects empty free set)', () => {
    const { freeSlots, error } = parseAvailableTimePayload({ data: [], statusCode: 0 })
    expect(error).toBeUndefined()
    expect(freeSlots.size).toBe(0)
  })

  it('returns error for non-zero statusCode', () => {
    const { freeSlots, error } = parseAvailableTimePayload({ data: [], statusCode: 429, message: 'Too many requests' })
    expect(freeSlots.size).toBe(0)
    expect(error).toBe('Too many requests')
  })

  it('returns error for malformed payloads', () => {
    expect(parseAvailableTimePayload(null).error).toBeTruthy()
    expect(parseAvailableTimePayload({ data: 'nope', statusCode: 0 }).error).toBeTruthy()
  })
})

describe('unionFreeSlots', () => {
  it('unions free slots across genders', () => {
    const male = parseAvailableTimePayload(maleAvailableTime)
    const female = parseAvailableTimePayload({
      data: [{ fromTime: '17:00:00', toTime: '18:00:00', productId: 56921 }],
      statusCode: 0,
    })
    const union = unionFreeSlots([male, female])
    expect(isAloPlaySlotFree(union, 112282, '17:00')).toBe(true)
    expect(isAloPlaySlotFree(union, 56921, '17:00')).toBe(true)
  })
})

describe('suspectedOccupiedFromFreeSet', () => {
  it('does not mark court 3 occupied at 17:00 when GetAvailableTime lists it free', () => {
    const { freeSlots } = parseAvailableTimePayload(maleAvailableTime)
    const occupied = suspectedOccupiedFromFreeSet(court3Mapping, freeSlots)
    expect(occupied.some((slot) => slot.courtKey === 'court-3' && slot.startTime === '17:00')).toBe(false)
    expect(occupied.some((slot) => slot.courtKey === 'court-3' && slot.startTime === '20:00')).toBe(false)
  })

  it('marks court/product not in available list at 10:00 as occupied', () => {
    const { freeSlots } = parseAvailableTimePayload(maleAvailableTime)
    const occupied = suspectedOccupiedFromFreeSet(allCourtsMapping, freeSlots)
    expect(occupied).toContainEqual({ courtKey: 'court-1', startTime: '10:00' })
    expect(occupied).toContainEqual({ courtKey: 'court-3', startTime: '10:00' })
    expect(occupied.some((slot) => slot.courtKey === 'court-1' && slot.startTime === '17:00')).toBe(true)
  })

  it('ignores GetByTime remainedCapacity — only GetAvailableTime drives free set', () => {
    const fromAvailable = parseAvailableTimePayload(maleAvailableTime)
    const fromByTime = parseAvailableTimePayload(byTimeWithZeroCapacity)
    expect(fromByTime.freeSlots.size).toBe(0)

    const union = unionFreeSlots([fromAvailable])
    const occupied = suspectedOccupiedFromFreeSet(court3Mapping, union)
    expect(occupied.some((slot) => slot.courtKey === 'court-3' && slot.startTime === '17:00')).toBe(false)
  })
})

describe('empty GetAvailableTime must not paint whole day', () => {
  it('empty free set would mark every mapped hour without the adapter guard', () => {
    const { freeSlots } = parseAvailableTimePayload({ data: [], statusCode: 0 })
    expect(freeSlots.size).toBe(0)
    const occupied = suspectedOccupiedFromFreeSet(allCourtsMapping, freeSlots)
    expect(occupied.length).toBe(allCourtsMapping.reduce((count, court) => count + court.starts.length, 0))
  })
})
