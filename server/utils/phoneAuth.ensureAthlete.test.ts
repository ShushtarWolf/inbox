import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@prisma/client'

const bookingUpdateMany = vi.fn()
const userCreate = vi.fn()
const userFindMany = vi.fn()
const userFindUnique = vi.fn()

function athlete(overrides: Partial<User> = {}): User {
  return {
    id: 'u-new',
    email: 'phone.09121112222@users.inbox.local',
    passwordHash: null,
    name: 'علی',
    nameFamily: 'رضایی',
    nameEn: 'علی رضایی',
    role: 'ATHLETE',
    secondaryRole: null,
    tertiaryRole: null,
    locale: 'fa',
    gender: null,
    phone: '09121112222',
    phoneVerifiedAt: null,
    avatarUrl: null,
    oauthProvider: null,
    oauthSubject: null,
    sheba: null,
    disabledAt: null,
    lastLoginAt: null,
    createdAt: new Date(),
    ...overrides,
  }
}

vi.stubGlobal('prisma', {
  user: {
    findMany: userFindMany,
    findUnique: userFindUnique,
    create: userCreate,
  },
  booking: {
    updateMany: bookingUpdateMany,
  },
})

describe('ensureAthleteUserByPhone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    bookingUpdateMany.mockResolvedValue({ count: 0 })
  })

  it('returns null for invalid phone without creating a user', async () => {
    const { ensureAthleteUserByPhone } = await import('./phoneAuth')
    const result = await ensureAthleteUserByPhone('not-a-phone')
    expect(result).toBeNull()
    expect(userCreate).not.toHaveBeenCalled()
  })

  it('creates ATHLETE with synthetic email and desk guest name', async () => {
    userFindMany.mockResolvedValue([])
    userCreate.mockResolvedValue(athlete())
    const { ensureAthleteUserByPhone } = await import('./phoneAuth')
    const result = await ensureAthleteUserByPhone('09121112222', {
      name: 'علی',
      nameFamily: 'رضایی',
    })
    expect(result?.role).toBe('ATHLETE')
    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phone: '09121112222',
          email: 'phone.09121112222@users.inbox.local',
          role: 'ATHLETE',
          locale: 'fa',
          phoneVerifiedAt: null,
          name: 'علی',
        }),
      }),
    )
    expect(bookingUpdateMany).toHaveBeenCalled()
  })

  it('uses ورزشکار when guest name is blank', async () => {
    userFindMany.mockResolvedValue([])
    userCreate.mockResolvedValue(athlete({ name: 'ورزشکار', nameFamily: null, nameEn: 'ورزشکار' }))
    const { ensureAthleteUserByPhone } = await import('./phoneAuth')
    await ensureAthleteUserByPhone('09121112222', { name: '  ', nameFamily: '' })
    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'ورزشکار' }),
      }),
    )
  })

  it('reuses legacy phone variant without create or overwrite', async () => {
    const legacy = athlete({ id: 'legacy-1', phone: '9121112222', name: 'قدیمی' })
    userFindMany.mockResolvedValue([legacy])
    const { ensureAthleteUserByPhone } = await import('./phoneAuth')
    const result = await ensureAthleteUserByPhone('09121112222', { name: 'جدید', nameFamily: 'نام' })
    expect(result?.id).toBe('legacy-1')
    expect(result?.name).toBe('قدیمی')
    expect(userCreate).not.toHaveBeenCalled()
    expect(bookingUpdateMany).toHaveBeenCalled()
  })

  it('re-queries after unique constraint race', async () => {
    userFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([athlete({ id: 'raced' })])
    userCreate.mockRejectedValue({ code: 'P2002' })
    const { ensureAthleteUserByPhone } = await import('./phoneAuth')
    const result = await ensureAthleteUserByPhone('09121112222')
    expect(result?.id).toBe('raced')
  })
})

describe('ensureAthleteUserForOwnerDesk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    bookingUpdateMany.mockResolvedValue({ count: 0 })
  })

  it('falls back to existing user when create throws unexpectedly', async () => {
    userFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([athlete({ id: 'fallback' })])
    userCreate.mockRejectedValue(new Error('db down'))
    const { ensureAthleteUserForOwnerDesk } = await import('./phoneAuth')
    const result = await ensureAthleteUserForOwnerDesk('09121112222')
    expect(result?.id).toBe('fallback')
  })
})

describe('auto-created athlete OTP login', () => {
  it('canOtpLogin passes for ATHLETE without password', async () => {
    const { canOtpLogin } = await import('#shared/roles.ts')
    expect(canOtpLogin({ role: 'ATHLETE', passwordHash: null })).toBe(true)
  })

  it('findUserForPhoneOtp resolves auto-created normalized phone', async () => {
    const created = athlete()
    userFindMany.mockResolvedValue([created])
    const { findUserForPhoneOtp } = await import('./phoneAuth')
    const match = await findUserForPhoneOtp('09121112222')
    expect(match?.user.id).toBe('u-new')
    expect(match?.linkPhone).toBe(false)
  })
})