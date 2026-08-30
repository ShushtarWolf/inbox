import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const bookingUpdate = vi.fn()
const slotUpdate = vi.fn()
const eventCreate = vi.fn()
const coachSessionUpdate = vi.fn()
const coachSessionFindUnique = vi.fn()
const transaction = vi.fn()
const refundPaymentForCancellation = vi.fn()
const syncClubContactForBooking = vi.fn()

vi.mock('./refunds', () => ({
  refundPaymentForCancellation: (...args: unknown[]) => refundPaymentForCancellation(...args),
}))

vi.mock('./contactSync', () => ({
  syncClubContactForBooking: (...args: unknown[]) => syncClubContactForBooking(...args),
}))

vi.stubGlobal('prisma', {
  booking: { update: (...args: unknown[]) => bookingUpdate(...args) },
  slot: { update: (...args: unknown[]) => slotUpdate(...args) },
  reservationEvent: { create: (...args: unknown[]) => eventCreate(...args) },
  coachSession: {
    update: (...args: unknown[]) => coachSessionUpdate(...args),
    findUnique: (...args: unknown[]) => coachSessionFindUnique(...args),
  },
  $transaction: (...args: unknown[]) => transaction(...args),
})

vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string }) => {
  const err = new Error(input.statusMessage) as Error & { statusCode: number }
  err.statusCode = input.statusCode
  return err
})

import { cancelCoachSession, cancelCourtBooking } from './cancellations'

describe('coach lesson ↔ court cancel unwind', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma as never))
    refundPaymentForCancellation.mockResolvedValue({
      refunded: true,
      walletCredited: true,
      gatewayRefunded: false,
      amount: 100,
    })
    syncClubContactForBooking.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('cancelCourtBooking cancels linked lesson with skipLinkedCourt', async () => {
    coachSessionFindUnique.mockResolvedValue({
      id: 'sess-1',
      status: 'CONFIRMED',
      athleteId: 'athlete-1',
      payment: { id: 'pay-lesson' },
    })

    await cancelCourtBooking({
      bookingId: 'book-1',
      slotId: 'slot-1',
      actorUserId: 'actor',
      reason: 'test',
      paymentId: 'pay-court',
      userId: 'coach-user',
    })

    expect(slotUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'slot-1' }, data: { displayStatus: 'FREE' } }),
    )
    expect(coachSessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sess-1' },
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    )
    // Lesson refund once; court refund once. Linked lesson path uses skipLinkedCourt so no recursion.
    expect(refundPaymentForCancellation).toHaveBeenCalledTimes(2)
    expect(refundPaymentForCancellation).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: 'pay-lesson', userId: 'athlete-1' }),
    )
    expect(refundPaymentForCancellation).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: 'pay-court', userId: 'coach-user' }),
    )
  })

  it('cancelCoachSession releases linked court with skipLinkedCoachSession', async () => {
    coachSessionFindUnique
      .mockResolvedValueOnce({
        courtBooking: {
          id: 'book-1',
          slotId: 'slot-1',
          status: 'CONFIRMED',
          userId: 'coach-user',
          payment: { id: 'pay-court' },
        },
      })

    await cancelCoachSession({
      sessionId: 'sess-1',
      actorUserId: 'actor',
      reason: 'test',
      paymentId: 'pay-lesson',
      userId: 'athlete-1',
    })

    expect(coachSessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sess-1' },
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    )
    expect(slotUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'slot-1' }, data: { displayStatus: 'FREE' } }),
    )
    expect(bookingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'book-1' },
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    )
    expect(refundPaymentForCancellation).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: 'pay-court', userId: 'coach-user' }),
    )
    expect(refundPaymentForCancellation).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: 'pay-lesson', userId: 'athlete-1' }),
    )
  })

  it('skipLinkedCoachSession avoids lesson cancel recursion from court', async () => {
    await cancelCourtBooking({
      bookingId: 'book-1',
      slotId: 'slot-1',
      reason: 'test',
      skipLinkedCoachSession: true,
    })
    expect(coachSessionFindUnique).not.toHaveBeenCalled()
    expect(refundPaymentForCancellation).not.toHaveBeenCalled()
  })
})
