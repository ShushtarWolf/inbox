import { beforeEach, describe, expect, it, vi } from 'vitest'

const notifyAthleteDiscountApproved = vi.fn()
const notifyAthleteDiscountRejected = vi.fn()
const createInAppNotification = vi.fn()

vi.mock('./discountApplicationNotify', () => ({
  notifyAthleteDiscountApproved: (...args: unknown[]) => notifyAthleteDiscountApproved(...args),
  notifyAthleteDiscountRejected: (...args: unknown[]) => notifyAthleteDiscountRejected(...args),
}))
vi.mock('./notify', () => ({
  createInAppNotification: (...args: unknown[]) => createInAppNotification(...args),
}))
vi.mock('./studentVerificationDuplicate', () => ({
  assertNoApprovedStudentNumberConflict: async () => {},
}))

const findFirst = vi.fn()
const applicationUpdate = vi.fn()
const membershipUpsert = vi.fn()
const transaction = vi.fn()

vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string }) => {
  const err = new Error(input.statusMessage) as Error & { statusCode: number }
  err.statusCode = input.statusCode
  return err
})
vi.stubGlobal('prisma', {
  discountApplication: { findFirst, update: applicationUpdate },
  discountMembership: { upsert: membershipUpsert },
  $transaction: transaction,
})

describe('discount application review athlete SMS', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createInAppNotification.mockResolvedValue(undefined)
    notifyAthleteDiscountApproved.mockResolvedValue(undefined)
    notifyAthleteDiscountRejected.mockResolvedValue(undefined)
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        discountApplication: { update: applicationUpdate },
        discountMembership: { upsert: membershipUpsert },
      }),
    )
  })

  it('approve triggers fire-and-forget athlete SMS', async () => {
    findFirst.mockResolvedValue({
      id: 'app-1',
      clubId: 'club-1',
      programId: 'prog-1',
      userId: 'user-1',
      status: 'PENDING',
      studentNumber: null,
      club: { nameFa: 'علم و صنعت', nameEn: null },
      program: {
        active: true,
        percent: 30,
        titleFa: 'تخفیف دانشجویی',
        verificationKind: 'STUDENT',
      },
      user: { id: 'user-1', name: 'علی' },
    })
    applicationUpdate.mockResolvedValue({})
    membershipUpsert.mockResolvedValue({})

    const { approveDiscountApplication } = await import('./discountMemberships.ts')
    await approveDiscountApplication({
      applicationId: 'app-1',
      clubId: 'club-1',
      reviewerId: 'owner-1',
    })

    expect(notifyAthleteDiscountApproved).toHaveBeenCalledWith(
      expect.objectContaining({
        clubId: 'club-1',
        clubName: 'علم و صنعت',
        programTitle: 'تخفیف دانشجویی',
        discountPercent: 30,
        verificationKind: 'STUDENT',
        athleteUserId: 'user-1',
      }),
    )
    expect(notifyAthleteDiscountRejected).not.toHaveBeenCalled()
  })

  it('reject triggers fire-and-forget athlete SMS', async () => {
    findFirst.mockResolvedValue({
      id: 'app-2',
      clubId: 'club-2',
      programId: 'prog-2',
      userId: 'user-2',
      status: 'PENDING',
      club: { nameFa: 'بهناز', nameEn: null },
      program: {
        titleFa: 'طرح',
        verificationKind: 'STUDENT',
      },
    })
    applicationUpdate.mockResolvedValue({})

    const { rejectDiscountApplication } = await import('./discountMemberships.ts')
    await rejectDiscountApplication({
      applicationId: 'app-2',
      clubId: 'club-2',
      reviewerId: 'owner-1',
      reason: 'تصویر ناخوانا',
    })

    expect(notifyAthleteDiscountRejected).toHaveBeenCalledWith(
      expect.objectContaining({
        clubId: 'club-2',
        clubName: 'بهناز',
        rejectReason: 'تصویر ناخوانا',
        athleteUserId: 'user-2',
      }),
    )
    expect(notifyAthleteDiscountApproved).not.toHaveBeenCalled()
  })
})