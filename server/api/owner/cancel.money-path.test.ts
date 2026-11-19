/** Owner single-slot cancel must use the series refund path for grouped IPG checkouts. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const cancelCourtBooking = vi.fn()
const cancelSeriesSessionWithSlot = vi.fn()
const bookingLooksLikeSeriesPayment = vi.fn()

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('createError', (e: { statusCode?: number; statusMessage?: string }) => {
  const err = new Error(e.statusMessage) as Error & { statusCode?: number }
  err.statusCode = e.statusCode
  return err
})
vi.stubGlobal('readBody', async (event: { body: unknown }) => event.body)
vi.stubGlobal('requireOwnerClub', async () => ({
  club: { id: 'club-1', nameFa: 'باشگاه', phone: null, owner: { phone: '09120000000' } },
}))
vi.stubGlobal('notifyWaitlistForFreedSlot', vi.fn().mockResolvedValue(undefined))
vi.stubGlobal('prisma', {
  slot: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
})

vi.mock('../../utils/cancellations', () => ({
  cancelCourtBooking: (...args: unknown[]) => cancelCourtBooking(...args),
}))
vi.mock('../../utils/ownerSeriesCancel', () => ({
  cancelOwnerSeriesBookings: vi.fn(),
  loadOwnerSeriesBookings: vi.fn().mockResolvedValue([]),
  finalizeSeasonBookingIfNoActiveSessions: vi.fn().mockResolvedValue(false),
}))
vi.mock('../../utils/reservations', () => ({
  activeSlotBooking: (b: unknown) => b,
}))
vi.mock('../../utils/seriesCancelRefund', () => ({
  bookingLooksLikeSeriesPayment: (...args: unknown[]) => bookingLooksLikeSeriesPayment(...args),
  cancelSeriesSessionWithSlot: (...args: unknown[]) => cancelSeriesSessionWithSlot(...args),
}))
vi.mock('../../utils/bookingNotify', () => ({
  clubNotifyName: (c: { nameFa?: string }) => c.nameFa || 'باشگاه',
  courtNotifyName: () => 'زمین',
  ownerNotifyPhone: () => '09120000000',
  personNotifyName: (...p: Array<string | null | undefined>) => p.filter(Boolean).join(' '),
  skipGuestBookingSms: () => false,
  skipGuestCancelSms: () => false,
  notifyBookingCancelled: vi.fn().mockResolvedValue(undefined),
  notifyOwnerBookingCancelled: vi.fn().mockResolvedValue(undefined),
}))

const seriesMeta = JSON.stringify({ coveredByBookingId: 'b-primary', sessionPrice: 300_000 })

describe('owner cancel money path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cancelCourtBooking.mockResolvedValue({ refund: { amount: 0 } })
    cancelSeriesSessionWithSlot.mockResolvedValue({ amount: 300_000, walletCredited: true })
    bookingLooksLikeSeriesPayment.mockImplementation((meta: string | null | undefined) => {
      return Boolean(meta && meta.includes('coveredByBookingId'))
    })
    vi.mocked(prisma.slot.findFirst).mockResolvedValue({
      id: 'slot-1',
      courtId: 'court-1',
      date: '2099-11-22',
      startTime: '18:00',
      endTime: '19:00',
      court: { nameFa: 'زمین ۱', clubId: 'club-1' },
      booking: {
        id: 'b-sibling',
        slotId: 'slot-1',
        userId: 'u1',
        guestName: 'Behnaz',
        guestFamily: null,
        guestMobile: '09022900854',
        paymentMethod: 'IPG',
        user: { phone: '09022900854', email: null, name: 'Behnaz', nameFamily: null },
        payment: {
          id: 'pay-sibling',
          status: 'PAID',
          method: 'IPG',
          amount: 0,
          metadataJson: seriesMeta,
        },
      },
    })
  })

  it('routes grouped checkout cancels through cancelSeriesSessionWithSlot', async () => {
    const { default: ownerCancel } = await import('./cancel.post')
    await ownerCancel({ body: { slotId: 'slot-1' } })
    expect(cancelSeriesSessionWithSlot).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: 'b-sibling',
        slotId: 'slot-1',
        userId: 'u1',
        moneyOutcome: 'full_wallet_refund',
      }),
    )
    expect(cancelCourtBooking).not.toHaveBeenCalled()
  })
})