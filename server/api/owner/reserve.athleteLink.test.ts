import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const ensureDesk = vi.fn()
const txCreate = vi.fn()

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('createError', (e: { statusMessage?: string }) => new Error(e.statusMessage))
vi.stubGlobal('readBody', async (event: { body: unknown }) => event.body)
vi.stubGlobal('requireOwnerClub', async () => ({
  club: { id: 'club-1', nameFa: 'باشگاه', phone: null, owner: { phone: '09120000000' } },
}))

const tx = {
  booking: { create: (...args: unknown[]) => txCreate(...args), update: vi.fn() },
  payment: { create: vi.fn() },
  reservationEvent: { create: vi.fn() },
  slot: { updateMany: vi.fn(async () => ({ count: 1 })) },
}
vi.stubGlobal('prisma', {
  slot: {
    findFirst: async () => ({
      id: 's1',
      date: '2026-12-01',
      startTime: '10:00',
      endTime: '11:00',
      price: 400_000,
      displayStatus: 'FREE',
      courtId: 'court-1',
      court: { id: 'court-1', nameFa: 'زمین ۱', clubId: 'club-1' },
      booking: null,
    }),
  },
  coach: { findFirst: async () => null },
  club: { findUnique: async () => ({ phone: null, nameFa: 'باشگاه', nameEn: '', owner: { phone: '09120000000' } }) },
  payment: { findUnique: async () => null },
  $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
})

vi.mock('../../utils/bookingTotal', () => ({
  calculateSessionTotal: ({ courtPrice }: { courtPrice: number }) => courtPrice,
  equipmentLineTotal: () => 0,
  loadEquipmentForBooking: async () => [],
  parseEquipmentSelections: () => [],
  syncBookingEquipments: vi.fn(),
}))
vi.mock('../../utils/phoneAuth', () => ({
  ensureAthleteUserForOwnerDesk: (...args: unknown[]) => ensureDesk(...args),
}))
vi.mock('../../utils/bookingNotify', () => ({
  notifyBookingConfirmed: vi.fn(),
  notifyBookingPaid: vi.fn(),
  notifyOwnerBookingPaid: vi.fn(),
  clubNotifyName: () => 'باشگاه',
  clubNotifyLocation: () => ({}),
  courtNotifyName: () => 'زمین',
  ownerNotifyPhone: () => '09120000000',
  personNotifyName: () => 'مهمان',
}))
vi.mock('../../utils/prismaErrors', () => ({ rethrowSlotConflict: (e: unknown) => { throw e } }))
vi.mock('../../utils/payPin', () => ({ assignBookingPayPin: async () => 'PIN' }))
vi.mock('../../utils/receipt', () => ({ payUrlForPin: () => '/pay' }))
vi.mock('../../utils/reservations', () => ({ activeSlotBooking: () => null }))
vi.mock('../../utils/onlinePaymentHold', () => ({ releaseExpiredOnlinePaymentHolds: vi.fn() }))
vi.mock('../../utils/settlement', () => ({ clawbackOwnerForPayment: vi.fn(), creditOwnerForPaidPayment: vi.fn() }))
vi.mock('../../utils/discountCodes', () => ({
  assertDiscountUsable: vi.fn(),
  findDiscountCodeByInput: vi.fn(),
}))
vi.mock('../../utils/contactSync', () => ({ syncClubContactForBooking: vi.fn() }))
vi.mock('../../utils/staleBooking', () => ({ deleteStaleCancelledBooking: vi.fn() }))
vi.mock('#shared/payments.ts', () => ({ getPaymentsMode: () => 'pay_at_club' }))
vi.mock('#shared/deskPaidGuard.ts', () => ({
  resolveDeskPaymentWrite: () => ({ method: 'CASH', status: 'PAY_AT_CLUB', error: null }),
}))
vi.mock('#shared/deskDiscountCarry.ts', () => ({
  carriedDeskDiscount: () => null,
  requestHasNoDiscount: () => false,
}))
vi.mock('#shared/bookingPayment.ts', () => ({
  isOnlinePaymentsEnabled: () => false,
  isPaidPaymentStatus: () => false,
}))

describe('owner reserve links userId from ensureAthleteUserForOwnerDesk', () => {
  beforeAll(async () => {
    await import('./reserve.post')
  })

  beforeEach(() => {
    vi.clearAllMocks()
    ensureDesk.mockResolvedValue({
      id: 'athlete-auto',
      name: 'سارا',
      nameFamily: 'احمدی',
      phone: '09123334444',
    })
    txCreate.mockResolvedValue({ id: 'booking-1' })
  })

  it('passes guest names into ensure and sets userId on create', async () => {
    const handler = (await import('./reserve.post')).default as (event: { body: unknown }) => Promise<unknown>
    await handler({
      body: {
        slotId: 's1',
        guestName: 'سارا',
        guestFamily: 'احمدی',
        guestMobile: '09123334444',
        paymentStatus: 'PAY_AT_CLUB',
      },
    })

    expect(ensureDesk).toHaveBeenCalledWith('09123334444', {
      name: 'سارا',
      nameFamily: 'احمدی',
    })
    expect(txCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'athlete-auto', guestMobile: '09123334444' }),
      }),
    )
  })
})