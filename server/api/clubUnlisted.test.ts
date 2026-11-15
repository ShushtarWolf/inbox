import { createError } from 'h3'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PUBLIC_CLUB_DIRECTORY_WHERE } from '#shared/clubDirectory.ts'

const listedClub = {
  id: 'listed',
  slug: 'listed-club',
  nameFa: 'لیست',
  nameEn: 'Listed',
  city: 'Tehran',
  district: null,
  lat: 35.7,
  lng: 51.4,
  rating: 4.5,
  priceFrom: 500000,
  priceTo: null,
  image: null,
  featured: false,
  isUnlisted: false,
  status: 'ACTIVE',
  openHour: 8,
  closeHour: 22,
  defaultSessionDurationMinutes: 60,
  sessionDurationsJson: null,
  descriptionFa: null,
  descriptionEn: null,
  phone: null,
  whatsapp: null,
  amenitiesJson: null,
  policiesJson: null,
  pricingJson: null,
  verifiedAt: null,
  cancellationWindowHours: 12,
  insideWindowRefundBps: 10000,
  rescheduleWindowHours: 24,
  bookingHorizonDays: 14,
  waitlistEnabled: true,
  addressFa: 'تهران',
  addressEn: 'Tehran',
}

const unlistedClub = { ...listedClub, id: 'unlisted', slug: 'iinboxss', nameFa: 'IInboxSS', isUnlisted: true }

const findMany = vi.fn()
const findUnique = vi.fn()
const update = vi.fn()
const requireAdminSecret = vi.fn()
const requireOwnerClub = vi.fn()

beforeAll(() => {
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('defineCachedEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('createError', createError)
  vi.stubGlobal('setHeader', () => {})
  vi.stubGlobal('getQuery', () => ({}))
  vi.stubGlobal('getRouterParam', (_e: unknown, key: string) => (key === 'id' ? 'club-1' : 'iinboxss'))
  vi.stubGlobal('readBody', async (event: { body?: unknown }) => (event as { body: unknown }).body)
  vi.stubGlobal('requireAdminSecret', (...args: unknown[]) => requireAdminSecret(...args))
  vi.stubGlobal('requireOwnerClub', (...args: unknown[]) => requireOwnerClub(...args))
  vi.stubGlobal('todayDateStr', () => '2026-11-15')
  vi.stubGlobal('prisma', {
    club: { findMany, findUnique, update },
    slot: { findMany: vi.fn(async () => []) },
  })
})

vi.mock('../utils/catalog', () => ({
  clubRankingScore: () => 1,
  getQueryNumber: () => undefined,
  haversineKm: () => 0,
  parseJsonArray: () => [],
  parseJsonValue: () => [],
  reviewSummary: () => ({ count: 0, average: null }),
}))
vi.mock('#shared/clubSlugAliases.ts', () => ({ resolveClubSlugAlias: (s: string) => s }))
vi.mock('#shared/pilotClub.ts', () => ({ PILOT_CLUB_LAT: 0, PILOT_CLUB_LNG: 0, PILOT_CLUB_SLUG: 'pilot' }))
vi.mock('#shared/clubReadiness.ts', () => ({ clubCatalogPriceRange: () => ({ priceFrom: 500000, priceTo: null }) }))
vi.mock('#shared/courtDisplay.ts', () => ({ sortCourtsByOrdinal: (c: unknown[]) => c }))
vi.mock('#shared/courtFacilities.ts', () => ({
  parseFacilitiesJson: () => [],
  parseSessionDurationsJson: () => [60],
}))
vi.mock('../../utils/shebaChange', () => ({ submitClubShebaChange: vi.fn() }))
vi.mock('#shared/bookingHorizon.ts', () => ({ clampBookingHorizonDays: (d: number) => d }))
vi.mock('#shared/clubImageUrl.ts', () => ({ parseClubImageInput: () => ({ ok: true, value: null }) }))

describe('club isUnlisted', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAdminSecret.mockImplementation(() => {})
    requireOwnerClub.mockResolvedValue({
      club: { id: 'club-1', slug: 'owner-club', nameFa: 'مالک' },
    })
  })

  it('GET /api/clubs excludes unlisted rows via directory where', async () => {
    findMany.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      expect(args.where).toMatchObject(PUBLIC_CLUB_DIRECTORY_WHERE)
      return [
        {
          ...listedClub,
          courts: [{ sport: { slug: 'tennis' } }],
          _count: { reviews: 0 },
        },
      ]
    })
    const handler = (await import('./clubs/index.get')).default as (e: unknown) => Promise<Array<{ slug: string }>>
    const rows = await handler({})
    expect(rows).toHaveLength(1)
    expect(rows[0]!.slug).toBe('listed-club')
    expect(findMany).toHaveBeenCalled()
  })

  it('GET /api/clubs/[slug] still returns an active unlisted club', async () => {
    findUnique.mockResolvedValue({
      ...unlistedClub,
      courts: [],
      media: [],
      reviews: [],
      equipment: [],
      coaches: [],
    })
    const handler = (await import('./clubs/[slug].get')).default as (e: unknown) => Promise<{ slug: string; isUnlisted: boolean }>
    const club = await handler({})
    expect(club.slug).toBe('iinboxss')
    expect(club.isUnlisted).toBe(true)
  })

  it('PATCH /api/admin/clubs/:id/unlisted requires admin secret', async () => {
    requireAdminSecret.mockImplementation(() => {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    })
    const handler = (await import('./admin/clubs/[id]/unlisted.patch')).default as (e: unknown) => Promise<unknown>
    await expect(handler({ body: { isUnlisted: true } })).rejects.toMatchObject({ statusCode: 403 })
    expect(update).not.toHaveBeenCalled()
  })

  it('PATCH /api/admin/clubs/:id/unlisted updates the flag for admins', async () => {
    findUnique.mockResolvedValue({ id: 'club-1' })
    update.mockResolvedValue({ id: 'club-1', slug: 'qa', isUnlisted: true })
    const handler = (await import('./admin/clubs/[id]/unlisted.patch')).default as (e: unknown) => Promise<{ isUnlisted: boolean }>
    const result = await handler({ body: { isUnlisted: true } })
    expect(result.isUnlisted).toBe(true)
    expect(update).toHaveBeenCalledWith({
      where: { id: 'club-1' },
      data: { isUnlisted: true },
      select: { id: true, slug: true, isUnlisted: true },
    })
  })

  it('owner settings patch does not accept isUnlisted from the body', async () => {
    findUnique.mockResolvedValue({ id: 'club-1', slug: 'owner-club' })
    update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'club-1',
      slug: 'owner-club',
      nameFa: data.nameFa ?? 'مالک',
      nameEn: 'Owner',
      city: 'Tehran',
      district: null,
      addressFa: 'تهران',
      addressEn: 'Tehran',
      phone: null,
      receiptPhone: null,
      bookingNotifyPhone: null,
      whatsapp: null,
      image: null,
      openHour: 8,
      closeHour: 22,
      defaultSessionDurationMinutes: 60,
      sessionDurationsJson: null,
      amenitiesJson: null,
      descriptionFa: null,
      descriptionEn: null,
      cancellationWindowHours: 12,
      insideWindowRefundBps: 10000,
      rescheduleWindowHours: 24,
      bookingHorizonDays: 14,
      waitlistEnabled: true,
      isUnlisted: false,
    }))
    const handler = (await import('./owner/settings.patch')).default as (e: { body: unknown }) => Promise<{ nameFa: string }>
    await handler({ body: { nameFa: 'نام جدید', isUnlisted: true } })
    const updateArg = update.mock.calls[0]?.[0] as { data: Record<string, unknown> }
    expect(updateArg.data).not.toHaveProperty('isUnlisted')
    expect(updateArg.data.nameFa).toBe('نام جدید')
  })
})