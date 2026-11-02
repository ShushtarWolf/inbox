import { describe, expect, it } from 'vitest'
import {
  allocateSessionNets,
  lastSessionDate,
  seasonUnlockDelta,
  targetSeasonUnlockedNet,
} from './seasonSettlementUnlock.ts'

const sessions = [
  { bookingId: 'b1', date: '2026-10-01', sessionPrice: 600_000, cancelled: false },
  { bookingId: 'b2', date: '2026-10-08', sessionPrice: 600_000, cancelled: false },
  { bookingId: 'b3', date: '2026-10-15', sessionPrice: 600_000, cancelled: false },
  { bookingId: 'b4', date: '2026-10-22', sessionPrice: 600_000, cancelled: false },
]

describe('lastSessionDate', () => {
  it('picks the latest ISO date', () => {
    expect(lastSessionDate(sessions)).toBe('2026-10-22')
  })
})

describe('allocateSessionNets', () => {
  it('splits ownerNet evenly when prices match', () => {
    const map = allocateSessionNets(2_400_000, sessions)
    expect([...map.values()]).toEqual([600_000, 600_000, 600_000, 600_000])
  })

  it('puts remainder on the last session', () => {
    const map = allocateSessionNets(1_000_000, [
      { bookingId: 'a', date: '2026-01-01', sessionPrice: 1, cancelled: false },
      { bookingId: 'b', date: '2026-01-08', sessionPrice: 1, cancelled: false },
      { bookingId: 'c', date: '2026-01-15', sessionPrice: 1, cancelled: false },
    ])
    expect(map.get('a')).toBe(333_333)
    expect(map.get('b')).toBe(333_333)
    expect(map.get('c')).toBe(333_334)
  })
})

describe('targetSeasonUnlockedNet', () => {
  const now = new Date('2026-10-09T12:00:00+03:30')

  it('unlocks only past sessions (day after class)', () => {
    // 10-01 past, 10-08 same calendar day-after? 10-08 → eligible on 10-09
    expect(targetSeasonUnlockedNet({ ownerNet: 2_400_000, sessions, now })).toBe(1_200_000)
  })

  it('skips cancelled sessions', () => {
    const withCancel = sessions.map((row) =>
      row.bookingId === 'b1' ? { ...row, cancelled: true } : row,
    )
    expect(targetSeasonUnlockedNet({ ownerNet: 2_400_000, sessions: withCancel, now })).toBe(600_000)
  })

  it('unlocks nothing before the first class day after', () => {
    expect(targetSeasonUnlockedNet({
      ownerNet: 2_400_000,
      sessions,
      now: new Date('2026-10-01T12:00:00+03:30'),
    })).toBe(0)
  })
})

describe('seasonUnlockDelta', () => {
  const now = new Date('2026-10-09T12:00:00+03:30')

  it('returns only the not-yet-unlocked share', () => {
    expect(seasonUnlockDelta({
      ownerNet: 2_400_000,
      sessions,
      alreadyUnlocked: 600_000,
      now,
    })).toBe(600_000)
  })

  it('caps by remainingNet after clawbacks', () => {
    expect(seasonUnlockDelta({
      ownerNet: 2_400_000,
      sessions,
      alreadyUnlocked: 0,
      remainingNet: 500_000,
      now,
    })).toBe(500_000)
  })
})
