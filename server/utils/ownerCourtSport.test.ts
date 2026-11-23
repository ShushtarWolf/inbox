import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  inferOwnerCourtSportSlug,
  normalizeOwnerCourtSportSlug,
  ownerCourtSportSlugFromApplication,
  resolveOwnerCourtSportForClub,
} from './ownerCourtSport'

const clubApplicationFindFirst = vi.fn()
const courtFindMany = vi.fn()
const sportFindFirst = vi.fn()

vi.stubGlobal('createError', (opts: { statusCode: number; statusMessage: string }) => {
  const err = new Error(opts.statusMessage) as Error & { statusCode: number }
  err.statusCode = opts.statusCode
  return err
})
vi.stubGlobal('prisma', {
  clubApplication: { findFirst: (...args: unknown[]) => clubApplicationFindFirst(...args) },
  court: { findMany: (...args: unknown[]) => courtFindMany(...args) },
  sport: { findFirst: (...args: unknown[]) => sportFindFirst(...args) },
})

describe('ownerCourtSport', () => {
  it('normalizes explicit sport slugs', () => {
    expect(normalizeOwnerCourtSportSlug('tennis')).toBe('tennis')
    expect(normalizeOwnerCourtSportSlug('padel')).toBe('padel')
    expect(normalizeOwnerCourtSportSlug('both')).toBeNull()
    expect(normalizeOwnerCourtSportSlug(undefined)).toBeNull()
  })

  it('maps application sport to court slug (both → padel default)', () => {
    expect(ownerCourtSportSlugFromApplication('tennis')).toBe('tennis')
    expect(ownerCourtSportSlugFromApplication('padel')).toBe('padel')
    expect(ownerCourtSportSlugFromApplication('both')).toBe('padel')
  })

  it('prefers club application sport over existing courts', () => {
    const courts = [{ sport: { slug: 'padel' } }, { sport: { slug: 'padel' } }]
    expect(inferOwnerCourtSportSlug('tennis', courts)).toBe('tennis')
  })

  it('infers from majority of existing courts when application missing', () => {
    const courts = [
      { sport: { slug: 'tennis' } },
      { sport: { slug: 'tennis' } },
      { sport: { slug: 'padel' } },
    ]
    expect(inferOwnerCourtSportSlug(null, courts)).toBe('tennis')
  })

  it('defaults to padel when no signal', () => {
    expect(inferOwnerCourtSportSlug(null, [])).toBe('padel')
  })
})

describe('resolveOwnerCourtSportForClub', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sportFindFirst.mockImplementation(async ({ where }: { where: { slug: string } }) => ({
      id: `id-${where.slug}`,
      slug: where.slug,
    }))
  })

  it('uses club application tennis when body omits sportSlug', async () => {
    clubApplicationFindFirst.mockResolvedValue({ sportSlug: 'tennis' })
    courtFindMany.mockResolvedValue([])
    const result = await resolveOwnerCourtSportForClub('club-1')
    expect(result).toEqual({ slug: 'tennis', sportId: 'id-tennis' })
    expect(sportFindFirst).toHaveBeenCalledWith({ where: { slug: 'tennis' } })
  })

  it('honors explicit sportSlug in body', async () => {
    const result = await resolveOwnerCourtSportForClub('club-1', 'padel')
    expect(result).toEqual({ slug: 'padel', sportId: 'id-padel' })
    expect(clubApplicationFindFirst).not.toHaveBeenCalled()
  })
})