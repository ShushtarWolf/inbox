import { beforeEach, describe, expect, it, vi } from 'vitest'

const notifyOwnerStudentCardSubmitted = vi.fn()
const createInAppNotification = vi.fn()

vi.mock('../../utils/rateLimit', () => ({
  enforceRateLimit: async () => {},
}))
vi.mock('../../utils/studentVerificationDuplicate', () => ({
  assertNoApprovedStudentNumberConflict: async () => {},
}))
vi.mock('../../utils/notify', () => ({
  createInAppNotification: (...args: unknown[]) => createInAppNotification(...args),
}))
vi.mock('../../utils/discountApplicationNotify', () => ({
  notifyOwnerStudentCardSubmitted: (...args: unknown[]) => notifyOwnerStudentCardSubmitted(...args),
}))

const findFirstProgram = vi.fn()
const findFirstMembership = vi.fn()
const findUniqueApplication = vi.fn()
const createApplication = vi.fn()

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('requireUser', async () => ({ id: 'user-1', name: 'Test User' }))
vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string }) => {
  const err = new Error(input.statusMessage) as Error & { statusCode: number }
  err.statusCode = input.statusCode
  return err
})
vi.stubGlobal('prisma', {
  discountProgram: { findFirst: findFirstProgram },
  discountMembership: { findFirst: findFirstMembership },
  discountApplication: {
    findUnique: findUniqueApplication,
    create: createApplication,
    update: vi.fn(),
  },
})

describe('POST /api/discount-applications owner SMS', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findFirstProgram.mockResolvedValue({
      id: 'prog-student',
      clubId: 'club-1',
      titleFa: 'تخفیف دانشجویی تنیس',
      active: true,
      verificationKind: 'STUDENT',
      club: { id: 'club-1', nameFa: 'علم و صنعت', ownerId: 'owner-1' },
    })
    findFirstMembership.mockResolvedValue(null)
    findUniqueApplication.mockResolvedValue(null)
    createApplication.mockResolvedValue({ id: 'app-1', status: 'PENDING', programId: 'prog-student' })
    notifyOwnerStudentCardSubmitted.mockResolvedValue(undefined)
    createInAppNotification.mockResolvedValue(null)
  })

  it('notifies owner via in-app and SMS on successful student submit', async () => {
    vi.stubGlobal('readBody', async () => ({
      programId: 'prog-student',
      proofUrls: ['https://cdn.example/card.jpg'],
      fullName: 'علی رضایی',
      studentNumber: '4012345678',
      ownershipConfirmed: true,
    }))
    const { default: handler } = await import('./index.post.ts')
    await handler({} as never)
    expect(createInAppNotification).toHaveBeenCalled()
    expect(notifyOwnerStudentCardSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({
        clubId: 'club-1',
        athleteName: 'علی رضایی',
        programTitle: 'تخفیف دانشجویی تنیس',
      }),
    )
  })
})