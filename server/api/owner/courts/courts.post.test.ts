import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireOwnerClub = vi.fn()
const resolveOwnerCourtSportForClub = vi.fn()
const courtCreate = vi.fn()
const syncClubCatalogPrices = vi.fn()

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('readBody', async () => ({
  nameFa: 'زمین ۱',
  nameEn: 'Court 1',
  price: 600000,
  count: 1,
}))
vi.stubGlobal('createError', (opts: { statusCode: number; statusMessage: string }) => {
  const err = new Error(opts.statusMessage) as Error & { statusCode: number }
  err.statusCode = opts.statusCode
  return err
})
vi.stubGlobal('requireOwnerClub', (...args: unknown[]) => requireOwnerClub(...args))
vi.mock('../../../utils/ownerCourtSport', () => ({
  resolveOwnerCourtSportForClub: (...args: unknown[]) => resolveOwnerCourtSportForClub(...args),
}))
vi.mock('../../../utils/clubCatalogPrices', () => ({
  syncClubCatalogPrices: (...args: unknown[]) => syncClubCatalogPrices(...args),
}))
vi.stubGlobal('prisma', {
  court: {
    create: (...args: unknown[]) => courtCreate(...args),
  },
  $transaction: (ops: unknown[]) => Promise.all(ops),
})

describe('POST /api/owner/courts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireOwnerClub.mockResolvedValue({ club: { id: 'club-93202e' } })
    resolveOwnerCourtSportForClub.mockResolvedValue({ slug: 'tennis', sportId: 'sport-tennis' })
    courtCreate.mockResolvedValue({ id: 'court-1' })
    syncClubCatalogPrices.mockResolvedValue(undefined)
  })

  it('resolves sport from club when sportSlug is omitted', async () => {
    const handler = (await import('./index.post')).default as (event: unknown) => Promise<unknown>
    await handler({})
    expect(resolveOwnerCourtSportForClub).toHaveBeenCalledWith('club-93202e', undefined)
    expect(courtCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sportId: 'sport-tennis', clubId: 'club-93202e' }),
      }),
    )
  })
})