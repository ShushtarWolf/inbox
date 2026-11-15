/**
 * Athlete pay-at-club vs online vs zero-toman court booking (mocked Prisma).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { todayDateString } from '#shared/localDate.ts'

const notifyBookingConfirmed = vi.fn()
const notifyOwnerBookingConfirmed = vi.fn()
const assertAthletePayAtClubUnderLimit = vi.fn()

const state = vi.hoisted(() => ({
  club: {
    id: 'club-1',
    nameFa: 'باشگاه',
    nameEn: 'Club',
    slug: 'club',
    status: 'ACTIVE',
    bookingHorizonDays: 14,
    allowCashAtClub: true,
    phone: '02100000000',
    owner: { phone: '09121111111' },
  },
  user: { id: 'u1', phone: '09120000000', email: 'a@test.local', name: 'Ali', nameFamily: 'Test', gender: null },
  slot: {
    id: 'slot-1',
    courtId: 'court-1',
    date: '2099-06-15',
    startTime: '18:00',
    endTime: '19:00',
    displayStatus: 'FREE',
    booking: null,
    court: {
      id: 'court-1',
      clubId: 'club-1',
      price: 500_000,
      pricingJson: null,
      nameFa: 'زمین ۱',
      nameEn: 'Court 1',
      audience: 'MIXED',
      club: {
        id: 'club-1',
        nameFa: 'باشگاه',
        nameEn: 'Club',
        slug: 'club',
        status: 'ACTIVE',
        bookingHorizonDays: 14,
        allowCashAtClub: true,
        phone: '02100000000',
        owner: { phone: '09121111111' },
      },
    },
  },
  createdPayments: [] as Array<Record<string, unknown>>,
  createdBookings: [] as Array<Record<string, unknown>>,
}))

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('todayDateStr', () => todayDateString())
vi.stubGlobal('readBody', async (event: { body: unknown }) => event.body)
vi.stubGlobal('createError', (opts: { statusCode?: number; statusMessage?: string }) => {
  const err = new Error(opts.statusMessage || 'error') as Error & { statusCode?: number; statusMessage?: string }
  err.statusCode = opts.statusCode
  err.statusMessage = opts.statusMessage
  return err
})

vi.stubGlobal('requireUser', async () => state.user)

vi.mock('../../utils/requireOnlinePayments', () => ({
  requireOnlinePaymentsForAthlete: () => {},
}))
vi.mock('../../utils/onlinePaymentHold', () => ({
  releaseExpiredOnlinePaymentHolds: async () => {},
}))
vi.mock('../../utils/externalBookingGuard', () => ({
  assertExternalBookingAllowedIfEnabled: async () => {},
}))
vi.mock('../../utils/athletePayAtClub', () => ({
  assertAthletePayAtClubUnderLimit: (...args: unknown[]) => assertAthletePayAtClubUnderLimit(...args),
}))
vi.mock('../../utils/bookingNotify', () => ({
  clubNotifyLocation: () => ({}),
  clubNotifyName: () => 'باشگاه',
  courtNotifyName: () => 'زمین ۱',
  notifyBookingConfirmed: (...args: unknown[]) => notifyBookingConfirmed(...args),
  notifyBookingPaid: vi.fn(),
  notifyOwnerBookingConfirmed: (...args: unknown[]) => notifyOwnerBookingConfirmed(...args),
  ownerNotifyPhone: () => '09121111111',
  personNotifyName: () => 'Ali Test',
}))
vi.mock('../../utils/contactSync', () => ({ syncClubContactForBooking: vi.fn() }))
vi.mock('../../utils/reservations', () => ({ assertSlotBookable: vi.fn() }))
vi.mock('../../utils/staleBooking', () => ({ deleteStaleCancelledBooking: vi.fn() }))
vi.mock('../../utils/prismaErrors', () => ({
  rethrowSlotConflict: (e: unknown) => { throw e },
  SlotNotAvailableError: class SlotNotAvailableError extends Error {},
}))
vi.mock('../../utils/discountCodes', () => ({
  resolveDiscountForBooking: async () => null,
  redeemDiscountCode: vi.fn(),
  discountPaymentMetadata: vi.fn(),
}))
vi.mock('../../utils/bookingTotal', () => ({
  parseEquipmentSelections: () => [],
  loadEquipmentForBooking: async () => [],
  sumEquipmentPrices: () => 0,
  syncBookingEquipments: vi.fn(),
}))

const tx = {
  slot: {
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
  booking: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: 'book-1', ...data }
      state.createdBookings.push(row)
      return row
    }),
  },
  payment: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      state.createdPayments.push(data)
      return { id: 'pay-1', ...data }
    }),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  },
  reservationEvent: { create: vi.fn() },
}

vi.stubGlobal('prisma', {
  slot: {
    findMany: async () => [state.slot],
  },
  user: {
    findUniqueOrThrow: async () => state.user,
  },
  $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
})

type Handler = (event: { body: unknown }) => Promise<Record<string, unknown>>

describe('POST /api/bookings/court pay-at-club', () => {
  let courtPost: Handler
  const originalMode = process.env.PAYMENTS_MODE

  beforeEach(async () => {
    process.env.PAYMENTS_MODE = 'test'
    state.createdBookings.length = 0
    state.createdPayments.length = 0
    state.club.allowCashAtClub = true
    state.slot.court.club.allowCashAtClub = true
    state.slot.displayStatus = 'FREE'
    notifyBookingConfirmed.mockReset()
    notifyOwnerBookingConfirmed.mockReset()
    assertAthletePayAtClubUnderLimit.mockReset()
    vi.clearAllMocks()
    courtPost = (await import('./court.post')).default as Handler
  })

  afterEach(() => {
    process.env.PAYMENTS_MODE = originalMode
  })

  it('creates PAY_AT_CLUB cash booking when payAtClub is true', async () => {
    const res = await courtPost({ body: { slotIds: ['slot-1'], payAtClub: true } })
    expect(res.paymentStatus).toBe('PAY_AT_CLUB')
    expect(res.totalAmount).toBe(500_000)
    expect(state.createdPayments[0]).toMatchObject({
      amount: 500_000,
      method: 'CASH',
      status: 'PAY_AT_CLUB',
      provider: 'pay_at_club',
    })
    expect(assertAthletePayAtClubUnderLimit).toHaveBeenCalledWith('u1', 'club-1')
    expect(notifyBookingConfirmed).toHaveBeenCalled()
    expect(notifyOwnerBookingConfirmed).toHaveBeenCalled()
    const notifyArg = notifyBookingConfirmed.mock.calls[0]![0] as { paymentPaid?: boolean }
    expect(notifyArg.paymentPaid).not.toBe(true)
  })

  it('creates PENDING_ONLINE when payAtClub is false', async () => {
    const res = await courtPost({ body: { slotIds: ['slot-1'] } })
    expect(res.paymentStatus).toBe('PENDING_ONLINE')
    expect(state.createdPayments[0]).toMatchObject({
      method: 'NOT_PAID',
      status: 'PENDING_ONLINE',
    })
    expect(notifyBookingConfirmed).not.toHaveBeenCalled()
    expect(assertAthletePayAtClubUnderLimit).not.toHaveBeenCalled()
  })

  it('rejects payAtClub when club setting is off', async () => {
    state.club.allowCashAtClub = false
    state.slot.court.club.allowCashAtClub = false
    await expect(courtPost({ body: { slotIds: ['slot-1'], payAtClub: true } }))
      .rejects.toMatchObject({ statusMessage: 'ALLOW_CASH_AT_CLUB_DISABLED' })
  })
})