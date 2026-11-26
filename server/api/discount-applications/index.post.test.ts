import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../utils/rateLimit', () => ({
  enforceRateLimit: async () => {},
}))
vi.mock('../../utils/studentVerificationDuplicate', () => ({
  assertNoApprovedStudentNumberConflict: async () => {},
}))
vi.mock('../../utils/notify', () => ({
  createInAppNotification: async () => null,
}))

const findFirstProgram = vi.fn()
const findFirstMembership = vi.fn()
const findUniqueApplication = vi.fn()
vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('enforceRateLimit', async () => {})
vi.stubGlobal('requireUser', async () => ({ id: 'user-1', name: 'Test User' }))
vi.stubGlobal('readBody', async () => ({
  programId: 'prog-student',
  proofUrls: ['https://cdn.example/card.jpg'],
  fullName: 'علی رضایی',
  studentNumber: '4012345678',
  ownershipConfirmed: false,
}))
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
    create: vi.fn(),
    update: vi.fn(),
  },
})
describe('POST /api/discount-applications (student ownership)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findFirstProgram.mockResolvedValue({
      id: 'prog-student',
      clubId: 'club-1',
      active: true,
      verificationKind: 'STUDENT',
      club: { id: 'club-1', nameFa: 'تست', ownerId: 'owner-1' },
    })
    findFirstMembership.mockResolvedValue(null)
    findUniqueApplication.mockResolvedValue(null)
  })

  it('rejects student application without ownership confirmation', async () => {
    const { default: handler } = await import('./index.post.ts')
    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 400,
      message: 'OWNERSHIP_REQUIRED',
    })
    expect(prisma.discountApplication.create).not.toHaveBeenCalled()
  })
})