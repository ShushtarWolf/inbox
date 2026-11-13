/** Owner + athlete cancel endpoints: money first, then exactly one guest + one club cancel SMS. */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { order } = vi.hoisted(() => ({ order: [] as string[] }))
const slotFindFirst = vi.fn()
const bookingFindFirst = vi.fn()
const cancelCourtBooking = vi.fn()
const notifyBookingCancelled = vi.fn()
const notifyOwnerBookingCancelled = vi.fn()

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('createError', (e: { statusMessage?: string }) => new Error(e.statusMessage))
vi.stubGlobal('readBody', async (event: { body: unknown }) => event.body)
vi.stubGlobal('getRouterParam', () => 'b1')
vi.stubGlobal('requireOwnerClub', async () => ({
  club: { id: 'club-1', nameFa: 'دانشگاه', phone: null, owner: { phone: '09120000000' } },
}))
vi.stubGlobal('requireUser', async () => ({ id: 'u1' }))
vi.stubGlobal('notifyWaitlistForFreedSlot', vi.fn().mockResolvedValue(undefined))
vi.stubGlobal('prisma', {
  slot: { findFirst: (...a: unknown[]) => slotFindFirst(...a), update: vi.fn() },
  booking: { findFirst: (...a: unknown[]) => bookingFindFirst(...a) },
})

vi.mock('../../utils/cancellations', () => ({
  cancelCourtBooking: (...a: unknown[]) => { order.push('money'); return cancelCourtBooking(...a) },
}))
vi.mock('../../utils/ownerSeriesCancel', () => ({
  cancelOwnerSeriesBookings: vi.fn(),
  loadOwnerSeriesBookings: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../utils/reservations', () => ({
  activeSlotBooking: (b: unknown) => b,
}))
vi.mock('../../utils/refunds', () => ({ refundPaymentForCancellation: vi.fn() }))
vi.mock('../../utils/seriesCancelRefund', () => ({
  bookingLooksLikeSeriesPayment: () => false,
  cancelSeriesSessionWithSlot: vi.fn(),
  cancelUnpaidSeriesSiblings: vi.fn(),
  loadSeriesGroupForBooking: vi.fn(),
}))
vi.mock('../../utils/bookingNotify', () => ({
  clubNotifyName: (c: { nameFa?: string }) => c.nameFa || 'باشگاه',
  courtNotifyName: (c: { nameFa?: string }) => c.nameFa || '',
  ownerNotifyPhone: () => '09120000000',
  personNotifyName: (...p: Array<string | null | undefined>) => p.filter(Boolean).join(' '),
  skipGuestBookingSms: (b: { source?: string | null }) => b.source === 'CLUB',
  notifyBookingCancelled: (...a: unknown[]) => { order.push('guestSms'); return notifyBookingCancelled(...a) },
  notifyOwnerBookingCancelled: (...a: unknown[]) => { order.push('ownerSms'); return notifyOwnerBookingCancelled(...a) },
}))

type Handler = (event: unknown) => Promise<unknown>
let ownerCancel: Handler
let athleteCancel: Handler
beforeAll(async () => {
  ownerCancel = (await import('./cancel.post')).default as unknown as Handler
  athleteCancel = (await import('../bookings/[id]/cancel.patch')).default as unknown as Handler
})

const court = { nameFa: 'زمین ۳', club: { id: 'club-1', nameFa: 'دانشگاه', owner: { phone: '09120000000' }, cancellationWindowHours: 24, insideWindowRefundBps: 0 } }
const platformBooking = {
  id: 'b1',
  slotId: 's1',
  userId: 'u1',
  source: 'PLATFORM',
  status: 'CONFIRMED',
  guestName: 'بهناز',
  guestFamily: 'تعبدی',
  guestMobile: '09121111111',
  user: { phone: '09121111111', email: null, name: 'بهناز', nameFamily: 'تعبدی' },
  payment: { id: 'pay-1', status: 'PAID', metadataJson: null },
}

beforeEach(() => {
  vi.clearAllMocks()
  order.length = 0
  cancelCourtBooking.mockResolvedValue({ refund: null, refundFailed: false })
  notifyBookingCancelled.mockResolvedValue(undefined)
  notifyOwnerBookingCancelled.mockResolvedValue(undefined)
})

describe('owner cancel (POST /api/owner/cancel)', () => {
  it('refunds first, then one owner SMS and one guest SMS', async () => {
    slotFindFirst.mockResolvedValue({
      id: 's1', courtId: 'c1', date: '2099-11-13', startTime: '09:00', endTime: '10:00',
      court, booking: platformBooking,
    })
    await ownerCancel({ body: { slotId: 's1' } })
    expect(order).toEqual(['money', 'ownerSms', 'guestSms'])
    expect(notifyOwnerBookingCancelled).toHaveBeenCalledTimes(1)
    expect(notifyBookingCancelled).toHaveBeenCalledTimes(1)
    expect(notifyBookingCancelled.mock.calls[0]![0]).toMatchObject({ phone: '09121111111', skipGuest: false })
  })

  it('money failure → no SMS claims a cancel that did not happen', async () => {
    slotFindFirst.mockResolvedValue({
      id: 's1', courtId: 'c1', date: '2099-11-13', startTime: '09:00', endTime: '10:00',
      court, booking: platformBooking,
    })
    cancelCourtBooking.mockRejectedValue(new Error('refund failed'))
    await expect(ownerCancel({ body: { slotId: 's1' } })).rejects.toThrow()
    expect(notifyBookingCancelled).not.toHaveBeenCalled()
    expect(notifyOwnerBookingCancelled).not.toHaveBeenCalled()
  })
})

describe('athlete cancel (PATCH /api/bookings/:id/cancel)', () => {
  it('refunds first, then one guest SMS and one owner SMS', async () => {
    bookingFindFirst.mockResolvedValue({
      ...platformBooking,
      slot: { date: '2099-11-13', startTime: '09:00', endTime: '10:00', courtId: 'c1', court },
    })
    await athleteCancel({})
    expect(order).toEqual(['money', 'guestSms', 'ownerSms'])
    expect(notifyBookingCancelled).toHaveBeenCalledTimes(1)
    expect(notifyOwnerBookingCancelled).toHaveBeenCalledTimes(1)
  })
})
