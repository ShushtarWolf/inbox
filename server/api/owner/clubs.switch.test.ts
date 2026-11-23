import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireUser = vi.fn()
const prismaStaffFindFirst = vi.fn()
const setCookie = vi.fn()

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('readBody', async () => ({ clubId: 'club-b' }))
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
  staffMembership: {
    findFirst: (...args: unknown[]) => prismaStaffFindFirst(...args),
  },
})

describe('POST /api/owner/clubs/switch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireUser.mockResolvedValue({ id: 'user-1' })
  })

  it('rejects when user has no membership for clubId', async () => {
    prismaStaffFindFirst.mockResolvedValue(null)
    const handler = (await import('./clubs/switch.post')).default as (event: unknown) => Promise<unknown>
    await expect(handler({})).rejects.toMatchObject({ statusCode: 403 })
    expect(setCookie).not.toHaveBeenCalled()
  })

  it('sets owner_club_id cookie for authorized membership', async () => {
    prismaStaffFindFirst.mockResolvedValue({
      role: 'OWNER',
      isPrimary: true,
      club: { id: 'club-b', slug: 'b', nameFa: 'ب', nameEn: 'B', status: 'ACTIVE', image: null },
    })
    const handler = (await import('./clubs/switch.post')).default as (event: unknown) => Promise<unknown>
    const result = await handler({}) as { clubId: string }
    expect(result.clubId).toBe('club-b')
    expect(setCookie).toHaveBeenCalledWith({}, 'owner_club_id', 'club-b', { path: '/', sameSite: 'lax' })
  })
})