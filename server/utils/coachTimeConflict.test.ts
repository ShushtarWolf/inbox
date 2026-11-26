import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findCoachTimeConflict } from './coachTimeConflict'

const coachSessionFindFirst = vi.fn()
const bookingFindFirst = vi.fn()

vi.stubGlobal('prisma', {
  coachSession: { findFirst: coachSessionFindFirst },
  booking: { findFirst: bookingFindFirst },
})

describe('findCoachTimeConflict (B7)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    coachSessionFindFirst.mockResolvedValue(null)
    bookingFindFirst.mockResolvedValue(null)
  })

  it('detects active marketplace coach session', async () => {
    coachSessionFindFirst.mockResolvedValue({ id: 's1' })
    const conflict = await findCoachTimeConflict('coach-1', '2099-01-01', '18:00')
    expect(conflict).toEqual({ kind: 'coach_session', sessionId: 's1' })
    expect(bookingFindFirst).not.toHaveBeenCalled()
  })

  it('detects court booking tagged with coach at same slot', async () => {
    bookingFindFirst.mockResolvedValue({ id: 'b1' })
    const conflict = await findCoachTimeConflict('coach-1', '2099-01-01', '18:00')
    expect(conflict).toEqual({ kind: 'court_booking', bookingId: 'b1' })
  })

  it('returns null when coach is free', async () => {
    expect(await findCoachTimeConflict('coach-1', '2099-01-01', '18:00')).toBeNull()
  })
})