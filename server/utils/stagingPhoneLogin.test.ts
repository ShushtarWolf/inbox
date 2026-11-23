import { beforeEach, describe, expect, it, vi } from 'vitest'

const stagingEnabled = vi.fn()
const findUnique = vi.fn()
const create = vi.fn()
const update = vi.fn()
const linkOrphanBookingsByPhone = vi.fn()
const touchLastLogin = vi.fn()
const setUserSession = vi.fn()
const toSessionUser = vi.fn((u: { id: string }) => ({ id: u.id, role: u.role }))

vi.mock('#shared/stagingBoot.ts', () => ({
  stagingPhoneLoginEnabled: () => stagingEnabled(),
}))

vi.mock('./phoneAuth', () => ({
  linkOrphanBookingsByPhone: (...args: unknown[]) => linkOrphanBookingsByPhone(...args),
}))

vi.mock('./auth', () => ({
  touchLastLogin: (...args: unknown[]) => touchLastLogin(...args),
  toSessionUser: (u: unknown) => toSessionUser(u),
}))

vi.stubGlobal('createError', (opts: { statusCode: number; statusMessage: string }) => {
  const err = new Error(opts.statusMessage) as Error & { statusCode: number }
  err.statusCode = opts.statusCode
  return err
})

vi.stubGlobal('setUserSession', (...args: unknown[]) => setUserSession(...args))

vi.stubGlobal('prisma', {
  user: {
    findUnique: (...args: unknown[]) => findUnique(...args),
    create: (...args: unknown[]) => create(...args),
    update: (...args: unknown[]) => update(...args),
  },
})

describe('completeStagingPhoneLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stagingEnabled.mockReturnValue(false)
    linkOrphanBookingsByPhone.mockResolvedValue(undefined)
    touchLastLogin.mockResolvedValue(undefined)
    setUserSession.mockResolvedValue(undefined)
  })

  it('returns 404 when staging markers are absent (production safety)', async () => {
    const { completeStagingPhoneLogin } = await import('./stagingPhoneLogin')
    await expect(
      completeStagingPhoneLogin({} as never, { phone: '09121234567' }),
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(findUnique).not.toHaveBeenCalled()
    expect(setUserSession).not.toHaveBeenCalled()
  })

  it('creates ATHLETE for a new phone without SMS', async () => {
    stagingEnabled.mockReturnValue(true)
    findUnique.mockResolvedValue(null)
    const created = {
      id: 'u-new',
      phone: '09121234567',
      role: 'ATHLETE',
      secondaryRole: null,
      tertiaryRole: null,
      disabledAt: null,
    }
    create.mockResolvedValue(created)

    const { completeStagingPhoneLogin } = await import('./stagingPhoneLogin')
    const result = await completeStagingPhoneLogin({} as never, { phone: '0912 123 4567' })

    expect(result.ok).toBe(true)
    expect(result.redirectTo).toBe('/athlete/open-match')
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phone: '09121234567',
          role: 'ATHLETE',
          name: 'کاربر استیجینگ',
        }),
      }),
    )
    expect(linkOrphanBookingsByPhone).toHaveBeenCalledWith('u-new', '09121234567')
    expect(setUserSession).toHaveBeenCalled()
  })

  it('adds ATHLETE to an existing non-athlete user', async () => {
    stagingEnabled.mockReturnValue(true)
    const coach = {
      id: 'u-coach',
      phone: '09129876543',
      role: 'COACH',
      secondaryRole: null,
      tertiaryRole: null,
      disabledAt: null,
    }
    findUnique.mockResolvedValue(coach)
    update.mockResolvedValue({
      ...coach,
      secondaryRole: 'ATHLETE',
    })

    const { completeStagingPhoneLogin } = await import('./stagingPhoneLogin')
    const result = await completeStagingPhoneLogin({} as never, {
      phone: '09129876543',
      returnTo: '/athlete/open-match',
    })

    expect(result.ok).toBe(true)
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-coach' },
        data: expect.objectContaining({
          secondaryRole: 'ATHLETE',
        }),
      }),
    )
    expect(create).not.toHaveBeenCalled()
  })
})