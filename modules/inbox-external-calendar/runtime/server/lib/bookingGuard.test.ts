import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./adapters', () => ({
  fetchExternalOccupancy: vi.fn(),
}))

vi.mock('./mappings', () => ({
  getClubMapping: vi.fn(() => ({ inboxSlug: 'iust-tennis', courts: [] })),
  hasExternalMapping: vi.fn((slug: string) => slug === 'iust-tennis'),
}))

vi.mock('../../../lib/collectionLog', () => ({
  logExternalCollection: vi.fn(),
}))

const prismaMock = vi.hoisted(() => ({
  court: {
    findMany: vi.fn(),
  },
}))

vi.stubGlobal('prisma', prismaMock)

import { fetchExternalOccupancy } from './adapters'
import { assertExternalBookingAllowed } from './bookingGuard'

describe('assertExternalBookingAllowed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.court.findMany.mockResolvedValue([
      { id: 'court-1', nameFa: 'زمین ۱', openHour: null, closeHour: null },
    ])
  })

  it('skips when club has no external mapping', async () => {
    await assertExternalBookingAllowed({
      club: {
        id: 'club-1',
        slug: 'other-club',
        defaultSessionDurationMinutes: 60,
        openHour: 7,
        closeHour: 23,
      },
      slots: [{ courtId: 'court-1', date: '2026-09-14', startTime: '18:00' }],
    })
    expect(fetchExternalOccupancy).not.toHaveBeenCalled()
  })

  it('rejects when reconciled EXTERNAL_BUSY matches slot', async () => {
    vi.mocked(fetchExternalOccupancy).mockResolvedValue({
      occupied: [{
        courtKey: 'court-1',
        startTime: '18:00',
        endTime: '19:00',
        source: 'aloplay',
        state: 'EXTERNAL_BUSY',
      }],
      adapters: [],
      persistOccupied: [],
    })

    await expect(assertExternalBookingAllowed({
      club: {
        id: 'club-iust',
        slug: 'iust-tennis',
        defaultSessionDurationMinutes: 60,
        openHour: 7,
        closeHour: 23,
      },
      slots: [{ courtId: 'court-1', date: '2026-09-14', startTime: '18:00' }],
    })).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Slot occupied on external booking site',
    })
  })

  it('allows booking when external slot is not EXTERNAL_BUSY', async () => {
    vi.mocked(fetchExternalOccupancy).mockResolvedValue({
      occupied: [],
      adapters: [],
      persistOccupied: [],
    })

    await expect(assertExternalBookingAllowed({
      club: {
        id: 'club-iust',
        slug: 'iust-tennis',
        defaultSessionDurationMinutes: 60,
        openHour: 7,
        closeHour: 23,
      },
      slots: [{ courtId: 'court-1', date: '2026-09-14', startTime: '18:00' }],
    })).resolves.toBeUndefined()
  })

  it('allows booking when only UNKNOWN state is present (availability-first)', async () => {
    vi.mocked(fetchExternalOccupancy).mockResolvedValue({
      occupied: [{
        courtKey: 'court-1',
        startTime: '18:00',
        endTime: '19:00',
        source: 'aloplay',
        state: 'UNKNOWN',
      }],
      adapters: [],
      persistOccupied: [],
    })

    await assertExternalBookingAllowed({
      club: {
        id: 'club-iust',
        slug: 'iust-tennis',
        defaultSessionDurationMinutes: 60,
        openHour: 7,
        closeHour: 23,
      },
      slots: [{ courtId: 'court-1', date: '2026-09-14', startTime: '18:00' }],
    })

    expect(fetchExternalOccupancy).toHaveBeenCalledTimes(1)
  })
})
