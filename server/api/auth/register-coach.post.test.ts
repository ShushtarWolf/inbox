import { beforeEach, describe, expect, it, vi } from 'vitest'

const findUniqueUser = vi.fn()
const findFirstClub = vi.fn()
const findFirstCourt = vi.fn()
const findFirstSport = vi.fn()
const findUniqueCoach = vi.fn()

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('assertCoachProductEnabled', () => {})
vi.stubGlobal('enforceRateLimit', async () => {})
vi.stubGlobal('readBody', async () => ({
  name: 'Test',
  email: 'victim@example.com',
  password: 'hunter2',
  gender: 'MALE',
  phone: '09121234567',
}))
vi.stubGlobal('rejectDemoEmailInProduction', () => {})
vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string }) => {
  const err = new Error(input.statusMessage) as Error & { statusCode: number }
  err.statusCode = input.statusCode
  return err
})
vi.stubGlobal('prisma', {
  user: { findUnique: findUniqueUser },
  club: { findFirst: findFirstClub },
  court: { findFirst: findFirstCourt },
  sport: { findFirstOrThrow: findFirstSport },
  coach: { findUnique: findUniqueCoach },
  $transaction: vi.fn(),
})
vi.stubGlobal('hashSecret', (v: string) => v)
vi.stubGlobal('notifyAdminCoachApplication', async () => {})
vi.stubGlobal('setUserSession', async () => {})
vi.stubGlobal('touchLastLogin', async () => {})

describe('POST /api/auth/register-coach (S1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findFirstClub.mockResolvedValue(null)
    findFirstCourt.mockResolvedValue({ sport: { id: 'sport-1' } })
    findFirstSport.mockResolvedValue({ id: 'sport-1' })
    findUniqueCoach.mockResolvedValue(null)
  })

  it('rejects password signup when email already belongs to a user', async () => {
    findUniqueUser.mockImplementation(({ where }: { where: { email?: string; phone?: string } }) => {
      if (where.email) return { id: 'u1', role: 'ATHLETE', phone: '09120000000' }
      return null
    })
    const { default: handler } = await import('./register-coach.post.ts')
    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 403,
      message: 'EXISTING_ACCOUNT_USE_OTP',
    })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})