import { beforeEach, describe, expect, it, vi } from 'vitest'
import { markCoachSessionNoShow } from './coachSessionNoShow'

const sessionFindUnique = vi.fn()
const sessionUpdate = vi.fn()
const eventCreate = vi.fn()

vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string }) => {
  const err = new Error(input.statusMessage) as Error & { statusCode: number }
  err.statusCode = input.statusCode
  return err
})
vi.stubGlobal('prisma', {
  $transaction: async (fn: (tx: unknown) => unknown) => fn({
    coachSession: {
      findUnique: sessionFindUnique,
      update: sessionUpdate,
    },
    reservationEvent: { create: eventCreate },
  }),
})

describe('markCoachSessionNoShow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionFindUnique.mockResolvedValue({ id: 's1', status: 'CONFIRMED', noShowAt: null })
    sessionUpdate.mockResolvedValue({ id: 's1', noShowAt: new Date('2026-11-26') })
  })

  it('sets noShowAt and writes NO_SHOW event (no payment calls)', async () => {
    const updated = await markCoachSessionNoShow({ sessionId: 's1', actorUserId: 'owner-1' })
    expect(updated.noShowAt).toBeTruthy()
    expect(sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { noShowAt: expect.any(Date) } }),
    )
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'NO_SHOW' }) }),
    )
  })

  it('rejects cancelled sessions', async () => {
    sessionFindUnique.mockResolvedValue({ id: 's1', status: 'CANCELLED', noShowAt: null })
    await expect(
      markCoachSessionNoShow({ sessionId: 's1', actorUserId: 'owner-1' }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })
})