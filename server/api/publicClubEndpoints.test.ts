import { createError } from 'h3'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { findPrivateClubKeys } from '#shared/publicClub.ts'

/** Full DB-shaped club row, including the fields that must never be public. */
const fullClub = {
  id: 'club-1',
  slug: 'iust-tennis',
  nameFa: 'باشگاه',
  nameEn: 'Club',
  addressFa: 'تهران',
  addressEn: 'Tehran',
  city: 'Tehran',
  district: null,
  lat: 35.7,
  lng: 51.4,
  rating: 4.5,
  priceFrom: 5000,
  priceTo: 600000,
  image: null,
  featured: false,
  status: 'ACTIVE',
  openHour: 7,
  closeHour: 23,
  defaultSessionDurationMinutes: 60,
  sessionDurationsJson: null,
  descriptionFa: null,
  descriptionEn: null,
  phone: '02100000000',
  whatsapp: null,
  amenitiesJson: null,
  policiesJson: null,
  pricingJson: null,
  verifiedAt: null,
  cancellationWindowHours: 24,
  insideWindowRefundBps: 10000,
  rescheduleWindowHours: 24,
  bookingHorizonDays: 14,
  waitlistEnabled: false,
  // private
  sheba: 'IR000000000000000000000000',
  ownerId: 'owner-1',
  commissionBps: 0,
  credentialsJson: '{"license":"x"}',
  verificationNote: 'admin note',
  receiptPhone: '09120000000',
  bookingNotifyPhone: '09120000001',
  priceToLegacy: null,
}
const relations = {
  courts: [{ id: 'court-1', nameFa: 'زمین 3', nameEn: 'C3', price: 5000, pricingJson: null, facilitiesJson: null, sport: { slug: 'tennis', nameFa: 'تنیس', nameEn: 'Tennis' } }],
  media: [],
  reviews: [{ id: 'r1', rating: 5, title: null, body: 'ok', authorName: 'A', isVerified: true, publishedAt: new Date(), authorUserId: 'u-9', bookingId: 'b-9' }],
  equipment: [],
  coaches: [],
}

/** Minimal Prisma `select`/`include` emulation so the test sees what the DB would return. */
function project(row: Record<string, unknown>, args: { select?: Record<string, unknown>; include?: Record<string, unknown> }) {
  if (args.select) {
    const out: Record<string, unknown> = {}
    for (const [key, spec] of Object.entries(args.select)) {
      if (!spec) continue
      const value = key in relations ? (relations as Record<string, unknown>)[key] : row[key]
      if (Array.isArray(value) && spec && typeof spec === 'object' && 'select' in (spec as object)) {
        out[key] = value.map((item) => project(item as Record<string, unknown>, spec as { select: Record<string, unknown> }))
      }
      else if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && spec && typeof spec === 'object' && 'select' in (spec as object)) {
        out[key] = project(value as Record<string, unknown>, spec as { select: Record<string, unknown> })
      }
      else {
        out[key] = value
      }
    }
    return out
  }
  const out: Record<string, unknown> = { ...row }
  // Relations are only returned when included (as in Prisma).
  for (const rel of ['players', 'coach', 'court', 'club', 'sport', '_count']) {
    if (!(rel in (args.include || {}))) delete out[rel]
  }
  for (const [key, spec] of Object.entries(args.include || {})) {
    const value = (relations as Record<string, unknown>)[key] ?? (key === 'club' ? fullClub : row[key])
    out[key] = spec && typeof spec === 'object' && 'select' in (spec as object)
      ? project(value as Record<string, unknown>, spec as { select: Record<string, unknown> })
      : value
  }
  return out
}

const coachRow = {
  id: 'coach-1', nameFa: 'مربی', nameEn: 'Coach', city: 'Tehran', rating: 4, sessionPrice: 100, photo: null,
  featured: false, specialtiesJson: null, credentialsJson: null, languagesJson: null, verifiedAt: null,
  verificationNote: 'note', experienceYears: 3, isBookable: true, approvalStatus: 'APPROVED', approvalNote: 'ok',
  appliedAt: null, reviewedAt: null, userId: 'user-coach', clubId: 'club-1', sport: { slug: 'tennis' },
  _count: { reviews: 0 },
}

const prismaFake = {
  club: { findUnique: vi.fn(async (args: { select?: Record<string, unknown>; include?: Record<string, unknown> }) => project(fullClub, args)) },
  slot: { findMany: vi.fn(async () => []) },
  coach: { findMany: vi.fn(async (args: { include: Record<string, unknown> }) => [project(coachRow, { include: args.include })]) },
  packageDraft: {
    findUnique: vi.fn(async (args: { include: Record<string, unknown> }) => project({
      id: 'pkg-1', title: 'p', capacity: 4, price: 1000, discount: 0, status: 'OPEN', createdByUserId: 'owner-1',
      clubId: 'club-1', coach: coachRow, court: relations.courts[0],
      players: [{ id: 'pl', guestName: 'x', guestMobile: '09121111111', athleteId: 'a' }],
    }, { include: args.include })),
  },
}

beforeAll(() => {
  vi.stubGlobal('prisma', prismaFake)
  vi.stubGlobal('createError', createError)
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('defineCachedEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('setHeader', () => {})
  vi.stubGlobal('getQuery', () => ({}))
  vi.stubGlobal('getRouterParam', (_e: unknown, key: string) => (key === 'slug' ? 'iust-tennis' : 'pkg-1'))
  vi.stubGlobal('todayDateStr', () => '2026-11-12')
  vi.stubGlobal('assertCoachProductEnabled', () => {})
})

vi.mock('../utils/packagesGate', () => ({ packagesEnabledForEvent: () => true, assertPackagesEnabled: () => {} }))
vi.mock('../utils/packages', () => ({ countActivePackageSeats: async () => 1 }))

describe('public club endpoints never leak private club fields', () => {
  it('GET /api/clubs/[slug]: no sheba / ownerId / commission / admin notes / private phones', async () => {
    const handler = (await import('./clubs/[slug].get')).default as (e: unknown) => Promise<Record<string, unknown>>
    const res = await handler({})
    expect(findPrivateClubKeys(res)).toEqual([])
    expect(res).not.toHaveProperty('sheba')
    expect(res).not.toHaveProperty('ownerId')
    expect(res).not.toHaveProperty('receiptPhone')
    expect(res).not.toHaveProperty('bookingNotifyPhone')
    // Club contact phone and page fields stay.
    expect(res.phone).toBe('02100000000')
    expect(res.nameFa).toBe('باشگاه')
    expect(Array.isArray(res.courts)).toBe(true)
    const testimonial = (res.testimonials as Array<Record<string, unknown>>)[0]!
    expect(testimonial).not.toHaveProperty('authorUserId')
    expect(testimonial).not.toHaveProperty('bookingId')
  })

  it('GET /api/coaches: nested club is a summary; coach account link and notes removed', async () => {
    const handler = (await import('./coaches/index.get')).default as (e: unknown) => Promise<Array<Record<string, unknown>>>
    const res = await handler({})
    // Coach credentials are public (shown on the profile); check the nested club row.
    expect(findPrivateClubKeys(res[0]!.club)).toEqual([])
    expect(Object.keys(res[0]!.club as object).sort()).toEqual(['city', 'district', 'id', 'image', 'nameEn', 'nameFa', 'slug', 'status'])
    expect(res[0]).not.toHaveProperty('userId')
    expect(res[0]).not.toHaveProperty('approvalNote')
    expect(res[0]).not.toHaveProperty('verificationNote')
  })

  it('GET /api/packages/[id]: no player mobiles, no creator id, club summary only', async () => {
    const handler = (await import('./packages/[id].get')).default as (e: unknown) => Promise<Record<string, unknown>>
    const res = await handler({})
    expect(findPrivateClubKeys(res.club)).toEqual([])
    expect(res.club).not.toHaveProperty('sheba')
    expect(res.club).not.toHaveProperty('ownerId')
    expect(res).not.toHaveProperty('players')
    expect(res).not.toHaveProperty('createdByUserId')
    expect(res.coach).not.toHaveProperty('userId')
    expect(res.seatsLeft).toBe(3)
    expect(res.title).toBe('p')
  })
})
