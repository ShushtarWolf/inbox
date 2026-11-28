import { beforeEach, describe, expect, it, vi } from 'vitest'

const clubSideNotifyPhones = vi.fn()
const notifySmsSoft = vi.fn()
const userFindUnique = vi.fn()

vi.mock('./prisma', () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
  },
}))

vi.mock('./bookingNotify', () => ({
  clubNotifyName: (club: { nameFa?: string }) => club.nameFa || 'باشگاه',
  clubSideNotifyPhones: (...args: unknown[]) => clubSideNotifyPhones(...args),
  notifySmsSoft: (...args: unknown[]) => notifySmsSoft(...args),
}))

describe('notifyOwnerStudentCardSubmitted', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clubSideNotifyPhones.mockResolvedValue(['09121111111'])
    notifySmsSoft.mockResolvedValue(true)
    userFindUnique.mockResolvedValue({ phone: '09121234567' })
  })

  it('sends OWNER_STUDENT_CARD_SUBMITTED to club-side phones', async () => {
    const { notifyOwnerStudentCardSubmitted } = await import('./discountApplicationNotify.ts')
    await notifyOwnerStudentCardSubmitted({
      clubId: 'club-1',
      clubName: 'علم و صنعت',
      programTitle: 'تخفیف دانشجویی تنیس',
      athleteName: 'علی رضایی',
    })
    expect(clubSideNotifyPhones).toHaveBeenCalledWith(undefined, 'club-1')
    expect(notifySmsSoft).toHaveBeenCalledWith(
      '09121111111',
      'OWNER_STUDENT_CARD_SUBMITTED',
      expect.objectContaining({
        clubName: 'علم و صنعت',
        programTitle: 'تخفیف دانشجویی تنیس',
        athleteName: 'علی رضایی',
      }),
      'club-1',
    )
  })

  it('skips SMS when no club-side phones', async () => {
    clubSideNotifyPhones.mockResolvedValue([])
    const { notifyOwnerStudentCardSubmitted } = await import('./discountApplicationNotify.ts')
    await notifyOwnerStudentCardSubmitted({
      clubId: 'club-1',
      clubName: 'تست',
      programTitle: 'طرح',
      athleteName: 'کاربر',
    })
    expect(notifySmsSoft).not.toHaveBeenCalled()
  })
})

describe('notifyAthleteDiscountApproved', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    notifySmsSoft.mockResolvedValue(true)
    userFindUnique.mockResolvedValue({ phone: '09129876543' })
  })

  it('sends ATHLETE_DISCOUNT_APPROVED to athlete phone', async () => {
    const { notifyAthleteDiscountApproved } = await import('./discountApplicationNotify.ts')
    await notifyAthleteDiscountApproved({
      clubId: 'club-1',
      clubName: 'علم و صنعت',
      programTitle: 'تخفیف دانشجویی',
      discountPercent: 30,
      verificationKind: 'STUDENT',
      athleteUserId: 'user-1',
    })
    expect(userFindUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { phone: true },
    })
    expect(notifySmsSoft).toHaveBeenCalledWith(
      '09129876543',
      'ATHLETE_DISCOUNT_APPROVED',
      expect.objectContaining({
        clubName: 'علم و صنعت',
        programTitle: 'تخفیف دانشجویی',
        discountPercent: 30,
        verificationKind: 'STUDENT',
      }),
      'club-1',
    )
  })

  it('skips SMS when athlete has no phone', async () => {
    userFindUnique.mockResolvedValue({ phone: null })
    const { notifyAthleteDiscountApproved } = await import('./discountApplicationNotify.ts')
    await notifyAthleteDiscountApproved({
      clubId: 'club-1',
      clubName: 'تست',
      programTitle: 'طرح',
      athleteUserId: 'user-2',
    })
    expect(notifySmsSoft).not.toHaveBeenCalled()
  })
})

describe('notifyAthleteDiscountRejected', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    notifySmsSoft.mockResolvedValue(true)
    userFindUnique.mockResolvedValue({ phone: '09121112222' })
  })

  it('sends ATHLETE_DISCOUNT_REJECTED with reason', async () => {
    const { notifyAthleteDiscountRejected } = await import('./discountApplicationNotify.ts')
    await notifyAthleteDiscountRejected({
      clubId: 'club-9',
      clubName: 'باشگاه آلفا',
      programTitle: 'کارت دانشجویی',
      verificationKind: 'STUDENT',
      athleteUserId: 'user-3',
      rejectReason: 'تصویر نامعتبر',
    })
    expect(notifySmsSoft).toHaveBeenCalledWith(
      '09121112222',
      'ATHLETE_DISCOUNT_REJECTED',
      expect.objectContaining({
        clubName: 'باشگاه آلفا',
        rejectReason: 'تصویر نامعتبر',
        verificationKind: 'STUDENT',
      }),
      'club-9',
    )
  })
})