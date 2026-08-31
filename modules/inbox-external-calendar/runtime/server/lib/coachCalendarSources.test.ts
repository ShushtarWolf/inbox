import { createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../../server/utils/coachClubLinks', () => ({
  requireActiveClub: vi.fn(),
  requireApprovedCoach: vi.fn(async () => ({ id: 'coach-1' })),
}))

vi.mock('./calendarSources', () => ({
  buildCalendarSourcesResponse: vi.fn(),
}))

vi.mock('./inboxCalendar', () => ({
  loadInboxOwnerCalendar: vi.fn(),
}))

vi.mock('./adapters', () => ({
  fetchExternalOccupancy: vi.fn(),
}))

vi.mock('./occupancySnapshots', () => ({
  persistAndMergeExternalOccupancy: vi.fn(async ({ liveOccupied }) => liveOccupied),
}))

vi.mock('./mappings', () => ({
  getClubMapping: vi.fn(),
  hasExternalMapping: vi.fn(),
}))

vi.mock('./sourceDetails', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./sourceDetails')>()
  return actual
})

import { requireActiveClub, requireApprovedCoach } from '../../../../../server/utils/coachClubLinks'
import { fetchExternalOccupancy } from './adapters'
import { buildCoachCalendarSourcesForClub } from './coachCalendarSources'
import { buildCalendarSourcesResponse } from './calendarSources'
import { loadInboxOwnerCalendar } from './inboxCalendar'
import { getClubMapping, hasExternalMapping } from './mappings'

describe('buildCoachCalendarSourcesForClub', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('delegates to buildCalendarSourcesResponse for an active club', async () => {
    vi.mocked(requireActiveClub).mockResolvedValue({
      id: 'club-iust', slug: 'iust-tennis', status: 'ACTIVE',
    } as Awaited<ReturnType<typeof requireActiveClub>>)
    vi.mocked(buildCalendarSourcesResponse).mockResolvedValue({
      date: '2026-08-30',
      mapped: true,
      cells: [],
    } as Awaited<ReturnType<typeof buildCalendarSourcesResponse>>)

    const result = await buildCoachCalendarSourcesForClub({
      coachId: 'coach-1',
      clubId: 'club-iust',
      date: '2026-08-30',
    })

    expect(requireActiveClub).toHaveBeenCalledWith('club-iust')
    expect(buildCalendarSourcesResponse).toHaveBeenCalledWith({
      clubId: 'club-iust',
      clubSlug: 'iust-tennis',
      date: '2026-08-30',
    })
    expect(result.mapped).toBe(true)
  })

  it('404 when club is not active', async () => {
    vi.mocked(requireActiveClub).mockRejectedValue(
      createError({ statusCode: 404, statusMessage: 'Club not found' }),
    )

    await expect(buildCoachCalendarSourcesForClub({
      coachId: 'coach-1',
      clubId: 'club-iust',
      date: '2026-08-30',
    })).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('buildCalendarSourcesResponse coach occupancy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('prisma', {
      ownerExternalNote: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    })
    vi.mocked(hasExternalMapping).mockReturnValue(true)
    vi.mocked(getClubMapping).mockReturnValue({
      inboxSlug: 'iust-tennis',
      label: 'دانشگاه علم و صنعت',
      sources: { aloplay: { clubId: 10887, clubTitle: 'دانشگاه علم وصنعت' } },
      courts: [{ inboxCourtId: 'court-1', external: { aloplay: { productId: 56921 } } }],
    })
    vi.mocked(loadInboxOwnerCalendar).mockResolvedValue({
      date: '2026-08-30',
      clubSlug: 'iust-tennis',
      sessionDurationMinutes: 60,
      courts: [{
        id: 'court-1',
        nameFa: 'زمین ۱',
        nameEn: 'Court 1',
        effectiveOpenHour: 8,
        effectiveCloseHour: 22,
      }],
      slots: [{
        courtId: 'court-1',
        startTime: '10:00',
        endTime: '11:00',
        displayStatus: 'FREE',
      }],
    })
    vi.mocked(fetchExternalOccupancy).mockResolvedValue({
      occupied: [{
        courtKey: 'court-1',
        startTime: '10:00',
        endTime: '11:00',
        source: 'aloplay',
      }],
      adapters: [{
        source: 'aloplay',
        occupied: [{
          courtKey: 'court-1',
          startTime: '10:00',
          endTime: '11:00',
          source: 'aloplay',
        }],
        supported: true,
      }],
    })
  })

  it('includes AloPlay siteLabel on inbox-free externally occupied cells', async () => {
    const { buildCalendarSourcesResponse: buildReal } = await vi.importActual<typeof import('./calendarSources')>('./calendarSources')
    vi.mocked(buildCalendarSourcesResponse).mockImplementation(buildReal)

    const payload = await buildCalendarSourcesResponse({
      clubId: 'club-iust',
      clubSlug: 'iust-tennis',
      date: '2026-08-30',
    })

    expect(payload.cells).toHaveLength(1)
    const cell = payload.cells[0]
    expect(cell?.occupied).toBe(true)
    expect(cell?.sourceDetails?.find((detail) => detail.source === 'aloplay')?.siteLabel).toBe('الوپلی')
  })

  it('shows both AloPlay and AloVarzesh labels on double-booked cells', async () => {
    vi.mocked(fetchExternalOccupancy).mockResolvedValue({
      occupied: [
        {
          courtKey: 'court-1',
          startTime: '10:00',
          endTime: '11:00',
          source: 'aloplay',
        },
        {
          courtKey: 'court-1',
          startTime: '10:00',
          endTime: '11:00',
          source: 'alovarzesh',
        },
      ],
      adapters: [],
    })

    const { buildCalendarSourcesResponse: buildReal } = await vi.importActual<typeof import('./calendarSources')>('./calendarSources')
    vi.mocked(buildCalendarSourcesResponse).mockImplementation(buildReal)

    const payload = await buildCalendarSourcesResponse({
      clubId: 'club-iust',
      clubSlug: 'iust-tennis',
      date: '2026-08-30',
    })

    const cell = payload.cells[0]
    expect(cell?.sources).toEqual(['aloplay', 'alovarzesh'])
    expect(cell?.badge).toBe('الوپلی + الوورزش')
    expect(cell?.sourceDetails?.map((detail) => detail.siteLabel)).toEqual(['الوپلی', 'الوورزش'])
  })
})

describe('handleCoachCalendarSourcesRequest auth', () => {
  beforeEach(() => {
    vi.stubGlobal('assertCoachProductEnabled', vi.fn())
    vi.stubGlobal('getQuery', vi.fn(() => ({ clubId: 'club-iust', date: '2026-08-30' })))
    vi.stubGlobal('todayDateStr', vi.fn(() => '2026-08-30'))
    vi.stubGlobal('requireApprovedCoach', vi.fn(async () => ({ id: 'coach-1' })))
    vi.stubGlobal('createError', createError)
  })

  it('401 when unauthenticated', async () => {
    vi.stubGlobal('requireRole', vi.fn(async () => {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }))

    const { handleCoachCalendarSourcesRequest } = await import('./coachCalendarSources')
    await expect(handleCoachCalendarSourcesRequest({} as import('h3').H3Event))
      .rejects.toMatchObject({ statusCode: 401 })
  })

  it('404 when club is not active', async () => {
    vi.stubGlobal('requireRole', vi.fn(async () => ({ id: 'user-1' })))
    vi.mocked(requireApprovedCoach).mockResolvedValue({ id: 'coach-1' } as Awaited<ReturnType<typeof requireApprovedCoach>>)
    vi.mocked(requireActiveClub).mockRejectedValue(
      createError({ statusCode: 404, statusMessage: 'Club not found' }),
    )

    const { handleCoachCalendarSourcesRequest } = await import('./coachCalendarSources')
    await expect(handleCoachCalendarSourcesRequest({} as import('h3').H3Event))
      .rejects.toMatchObject({ statusCode: 404 })
  })
})
