import { createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../../server/utils/coachClubLinks', () => ({
  requireActiveCoachClubLink: vi.fn(),
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

vi.mock('./mappings', () => ({
  getClubMapping: vi.fn(),
  hasExternalMapping: vi.fn(),
}))

vi.mock('./sourceDetails', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./sourceDetails')>()
  return actual
})

import { requireActiveCoachClubLink } from '../../../../../server/utils/coachClubLinks'
import { fetchExternalOccupancy } from './adapters'
import { buildCoachCalendarSourcesForClub } from './coachCalendarSources'
import { buildCalendarSourcesResponse } from './calendarSources'
import { loadInboxOwnerCalendar } from './inboxCalendar'
import { getClubMapping, hasExternalMapping } from './mappings'

describe('buildCoachCalendarSourcesForClub', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('delegates to buildCalendarSourcesResponse for an active club link', async () => {
    vi.mocked(requireActiveCoachClubLink).mockResolvedValue({
      club: { id: 'club-iust', slug: 'iust-tennis', status: 'ACTIVE' },
    } as Awaited<ReturnType<typeof requireActiveCoachClubLink>>)
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

    expect(requireActiveCoachClubLink).toHaveBeenCalledWith('coach-1', 'club-iust')
    expect(buildCalendarSourcesResponse).toHaveBeenCalledWith({
      clubId: 'club-iust',
      clubSlug: 'iust-tennis',
      date: '2026-08-30',
    })
    expect(result.mapped).toBe(true)
  })

  it('403 when coach has no active club link', async () => {
    vi.mocked(requireActiveCoachClubLink).mockRejectedValue(
      createError({ statusCode: 403, statusMessage: 'COACH_CLUB_LINK_NOT_ACTIVE' }),
    )

    await expect(buildCoachCalendarSourcesForClub({
      coachId: 'coach-1',
      clubId: 'club-iust',
      date: '2026-08-30',
    })).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('buildCalendarSourcesResponse coach occupancy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it('403 when coach lacks active club link', async () => {
    vi.stubGlobal('requireRole', vi.fn(async () => ({ id: 'user-1' })))
    vi.mocked(requireActiveCoachClubLink).mockRejectedValue(
      createError({ statusCode: 403, statusMessage: 'COACH_CLUB_LINK_NOT_ACTIVE' }),
    )

    const { handleCoachCalendarSourcesRequest } = await import('./coachCalendarSources')
    await expect(handleCoachCalendarSourcesRequest({} as import('h3').H3Event))
      .rejects.toMatchObject({ statusCode: 403 })
  })
})
