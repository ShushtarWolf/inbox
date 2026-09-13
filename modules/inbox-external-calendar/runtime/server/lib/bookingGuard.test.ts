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
  manualAvailabilityOverride: {
    findMany: vi.fn(),
  },
}))

vi.stubGlobal('prisma', prismaMock)

import { logExternalCollection } from '../../../lib/collectionLog'
import { fetchExternalOccupancy } from './adapters'
import { assertExternalBookingAllowed } from './bookingGuard'

describe('assertExternalBookingAllowed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.court.findMany.mockResolvedValue([
      { id: 'court-1', nameFa: 'زمین ۱', openHour: null, closeHour: null },
    ])
    prismaMock.manualAvailabilityOverride.findMany.mockResolvedValue([])
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

  it('allows booking when fetchExternalOccupancy throws (fail-open, no 500)', async () => {
    vi.mocked(fetchExternalOccupancy).mockRejectedValue(new Error('Network timeout'))

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

    expect(logExternalCollection).toHaveBeenCalledWith('booking_guard_fetch_failed', expect.objectContaining({
      clubSlug: 'iust-tennis',
      date: '2026-09-14',
      policy: 'fail_open_unknown',
      error: 'Network timeout',
    }))
  })

  it('allows booking when EXTERNAL_BUSY has RELEASE override for exact slot', async () => {
    vi.mocked(fetchExternalOccupancy).mockResolvedValue({
      occupied: [{
        courtKey: 'court-1',
        startTime: '18:00',
        endTime: '19:00',
        source: 'alovarzesh',
        state: 'EXTERNAL_BUSY',
      }],
      adapters: [],
      persistOccupied: [],
    })
    prismaMock.manualAvailabilityOverride.findMany.mockResolvedValue([{
      courtId: 'court-1',
      date: '2026-09-14',
      startTime: '18:00',
      type: 'RELEASE',
    }])

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

  it('rejects booking when BLOCK override exists on externally free slot', async () => {
    vi.mocked(fetchExternalOccupancy).mockResolvedValue({
      occupied: [],
      adapters: [],
      persistOccupied: [],
    })
    prismaMock.manualAvailabilityOverride.findMany.mockResolvedValue([{
      courtId: 'court-1',
      date: '2026-09-14',
      startTime: '18:00',
      type: 'BLOCK',
    }])

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
      statusMessage: 'Slot not available',
    })
  })

  it('RELEASE on 18:00 does not release 19:00 EXTERNAL_BUSY', async () => {
    vi.mocked(fetchExternalOccupancy).mockResolvedValue({
      occupied: [
        {
          courtKey: 'court-1',
          startTime: '18:00',
          endTime: '19:00',
          source: 'alovarzesh',
          state: 'EXTERNAL_BUSY',
        },
        {
          courtKey: 'court-1',
          startTime: '19:00',
          endTime: '20:00',
          source: 'alovarzesh',
          state: 'EXTERNAL_BUSY',
        },
      ],
      adapters: [],
      persistOccupied: [],
    })
    prismaMock.manualAvailabilityOverride.findMany.mockResolvedValue([{
      courtId: 'court-1',
      date: '2026-09-14',
      startTime: '18:00',
      type: 'RELEASE',
    }])

    await expect(assertExternalBookingAllowed({
      club: {
        id: 'club-iust',
        slug: 'iust-tennis',
        defaultSessionDurationMinutes: 60,
        openHour: 7,
        closeHour: 23,
      },
      slots: [
        { courtId: 'court-1', date: '2026-09-14', startTime: '18:00' },
        { courtId: 'court-1', date: '2026-09-14', startTime: '19:00' },
      ],
    })).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Slot occupied on external booking site',
    })
  })

  it('still rejects EXTERNAL_BUSY when fetch succeeds after a prior date failure', async () => {
    vi.mocked(fetchExternalOccupancy)
      .mockRejectedValueOnce(new Error('AloPlay timeout'))
      .mockResolvedValueOnce({
        occupied: [{
          courtKey: 'court-2',
          startTime: '19:00',
          endTime: '20:00',
          source: 'alovarzesh',
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
      slots: [
        { courtId: 'court-1', date: '2026-09-14', startTime: '18:00' },
        { courtId: 'court-2', date: '2026-09-15', startTime: '19:00' },
      ],
    })).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Slot occupied on external booking site',
    })
  })
})
