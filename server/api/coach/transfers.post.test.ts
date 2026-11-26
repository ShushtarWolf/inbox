import { beforeEach, describe, expect, it, vi } from 'vitest'

const transferClubCoach = vi.fn()

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('assertCoachProductEnabled', () => {})
vi.stubGlobal('requireUser', async () => ({ id: 'user-coach' }))
vi.stubGlobal('prisma', {
  coach: {
    findFirst: async () => ({ id: 'coach-1', clubId: 'club-1' }),
  },
})
vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string }) => {
  const err = new Error(input.statusMessage) as Error & { statusCode: number }
  err.statusCode = input.statusCode
  return err
})

vi.mock('../../utils/walletTransfer', () => ({
  transferClubCoach: (...args: unknown[]) => transferClubCoach(...args),
}))

describe('POST /api/coach/transfers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects club_to_coach from coach API (owner-only)', async () => {
    vi.stubGlobal('readBody', async () => ({
      clubId: 'club-1',
      amount: 50_000,
      direction: 'club_to_coach',
    }))
    const { default: handler } = await import('./transfers.post.ts')
    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 403,
      message: 'Only club owner can transfer from club wallet to coach',
    })
    expect(transferClubCoach).not.toHaveBeenCalled()
  })

  it('allows coach_to_club', async () => {
    vi.stubGlobal('readBody', async () => ({
      clubId: 'club-1',
      amount: 50_000,
      direction: 'coach_to_club',
    }))
    transferClubCoach.mockResolvedValue({ amount: 50_000, direction: 'coach_to_club' })
    const { default: handler } = await import('./transfers.post.ts')
    const result = await handler({} as never)
    expect(result).toMatchObject({ ok: true, direction: 'coach_to_club' })
    expect(transferClubCoach).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'coach_to_club' }),
    )
  })
})