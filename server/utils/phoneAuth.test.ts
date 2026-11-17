import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@prisma/client'

const prismaMock = {
  user: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  club: {
    findFirst: vi.fn(),
  },
}

vi.stubGlobal('prisma', prismaMock)

function athleteUser(overrides: Partial<User> = {}): User {
  return {
    id: 'athlete-1',
    email: 'phone.09120000000@users.inbox.local',
    passwordHash: null,
    name: 'تست',
    nameFamily: null,
    nameEn: null,
    role: 'ATHLETE',
    secondaryRole: null,
    tertiaryRole: null,
    locale: 'fa',
    gender: 'FEMALE',
    phone: '9364916923',
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

describe('findUserForPhoneOtp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.club.findFirst.mockResolvedValue(null)
  })

  it('matches legacy User.phone storage (9xxxxxxxxx without leading 0)', async () => {
    prismaMock.user.findMany.mockResolvedValue([athleteUser()])
    const { findUserForPhoneOtp } = await import('./phoneAuth')
    const match = await findUserForPhoneOtp('09364916923')
    expect(match).not.toBeNull()
    expect(match?.user.id).toBe('athlete-1')
    expect(match?.linkPhone).toBe(true)
    expect(match?.phone).toBe('09364916923')
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { phone: { in: expect.arrayContaining(['09364916923', '9364916923']) } },
      }),
    )
  })

  it('skips club owner lookup when a User.phone row already matches', async () => {
    prismaMock.user.findMany.mockResolvedValue([athleteUser({ phone: '09364916923', linkPhone: undefined } as User)])
    const { findUserForPhoneOtp } = await import('./phoneAuth')
    await findUserForPhoneOtp('09364916923')
    expect(prismaMock.club.findFirst).not.toHaveBeenCalled()
  })
})