import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireUser = vi.fn()
const prismaUserFindUnique = vi.fn()
const prismaStaffFindFirst = vi.fn()
const prismaTransaction = vi.fn()
const notifyAdminClubApplication = vi.fn()
const createOwnerClubForUser = vi.fn()
const setCookie = vi.fn()

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('readBody', async () => ({
  clubNameFa: 'باشگاه دوم',
  city: 'شوشتر',
  sport: 'padel',
}))
vi.stubGlobal('createError', (opts: { statusCode: number; statusMessage: string }) => {
  const err = new Error(opts.statusMessage) as Error & { statusCode: number }
  err.statusCode = opts.statusCode
  return err
})
vi.stubGlobal('setCookie', (...args: unknown[]) => setCookie(...args))
vi.mock('../../utils/auth', () => ({
  requireUser: (...args: unknown[]) => requireUser(...args),
}))
vi.stubGlobal('prisma', {
  user: { findUnique: (...args: unknown[]) => prismaUserFindUnique(...args) },
  staffMembership: {
    findFirst: (...args: unknown[]) => prismaStaffFindFirst(...args),
    findMany: async () => [
      { club: { status: 'ACTIVE' }, isPrimary: true },
    ],
  },
  $transaction: (fn: (tx: unknown) => Promise<unknown>) => prismaTransaction(fn),
})

vi.mock('../../utils/adminNotify', () => ({
  notifyAdminClubApplication: (...args: unknown[]) => notifyAdminClubApplication(...args),
}))
vi.mock('../../utils/ownerClubCreate', () => ({
  createOwnerClubForUser: (...args: unknown[]) => createOwnerClubForUser(...args),
}))

describe('POST /api/owner/clubs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireUser.mockResolvedValue({ id: 'user-1', role: 'CLUB_ADMIN', email: 'o@test.com' })
    prismaStaffFindFirst.mockResolvedValue({ id: 'sm-1' })
    prismaUserFindUnique.mockResolvedValue({
      id: 'user-1',
      email: 'o@test.com',
      name: 'مالک',
      nameFamily: null,
      nameEn: null,
      phone: '09120000000',
    })
    createOwnerClubForUser.mockResolvedValue({
      club: {
        id: 'club-2',
        slug: 'club-2',
        nameFa: 'باشگاه دوم',
        nameEn: 'باشگاه دوم',
        status: 'PENDING',
      },
      setupHandoff: null,
      sportKey: 'padel',
    })
    prismaTransaction.mockImplementation(async (fn) => fn({}))
  })

  it('rejects non-owner staff', async () => {
    prismaStaffFindFirst.mockResolvedValue(null)
    const handler = (await import('./clubs/index.post')).default as (event: unknown) => Promise<unknown>
    await expect(handler({})).rejects.toMatchObject({ statusCode: 403 })
  })

  it('creates a second club without switching when an ACTIVE club exists', async () => {
    const handler = (await import('./clubs/index.post')).default as (event: unknown) => Promise<unknown>
    const result = await handler({}) as { switched: boolean; club: { id: string } }
    expect(createOwnerClubForUser).toHaveBeenCalled()
    expect(notifyAdminClubApplication).toHaveBeenCalled()
    expect(result.switched).toBe(false)
    expect(setCookie).not.toHaveBeenCalled()
  })
})