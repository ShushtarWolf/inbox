/** Desk re-save (mark cash paid / unpaid / equipment) keeps the discount already on the payment. */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const upsert = vi.fn()
const h = vi.hoisted(() => ({
  payment: {
    id: 'pay-1',
    bookingId: 'b1',
    amount: 240_000,
    method: 'CASH',
    status: 'PAY_AT_CLUB',
    gatewayRef: null as string | null,
    metadataJson: JSON.stringify({ discountCode: 'HALF', discountPercent: 50, discountAmount: 240_000, subtotalBeforeDiscount: 480_000 }) as string | null,
  },
}))

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('createError', (e: { statusMessage?: string }) => new Error(e.statusMessage))
vi.stubGlobal('readBody', async (event: { body: unknown }) => event.body)
vi.stubGlobal('requireOwnerClub', async () => ({
  club: { id: 'club-1', nameFa: 'دانشگاه علم و صنعت', phone: null, owner: { phone: '09120000000' } },
}))

function slotRow() {
  return {
    id: 's1',
    date: '2026-11-14',
    startTime: '18:00',
    endTime: '19:00',
    price: 480_000,
    displayStatus: 'RESERVED',
    courtId: 'court-3',
    court: { id: 'court-3', nameFa: 'زمین ۳', clubId: 'club-1' },
    booking: {
      id: 'b1',
      status: 'CONFIRMED',
      paymentStatus: h.payment.status,
      paymentMethod: 'CASH',
      source: 'CLUB',
      userId: null,
      coachId: null,
      guestMobile: null,
      payment: { ...h.payment },
      user: null,
    },
  }
}

const tx = {
  booking: { update: vi.fn(), create: vi.fn() },
  payment: {
    findUnique: vi.fn(async () => ({ metadataJson: h.payment.metadataJson })),
    update: vi.fn(),
    upsert: (...a: unknown[]) => upsert(...a),
    create: vi.fn(),
  },
  reservationEvent: { create: vi.fn() },
  slot: { update: vi.fn(), updateMany: vi.fn() },
}
vi.stubGlobal('prisma', {
  slot: { findFirst: async () => slotRow() },
  coach: { findFirst: async () => null },
  club: { findUnique: async () => ({ phone: null, nameFa: 'باشگاه', nameEn: '', owner: { phone: '09120000000' } }) },
  payment: { findUnique: async () => ({ id: 'pay-1', amount: 240_000 }) },
  $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
})

vi.mock('../../utils/bookingTotal', () => ({
  calculateSessionTotal: ({ courtPrice }: { courtPrice: number }) => courtPrice,
  equipmentLineTotal: () => 0,
  loadEquipmentForBooking: async () => [],
  parseEquipmentSelections: () => [],
  syncBookingEquipments: vi.fn(),
}))
vi.mock('../../utils/phoneAuth', () => ({ findUserByPhone: async () => null }))
vi.mock('../../utils/bookingNotify', () => ({
  notifyBookingConfirmed: vi.fn(),
  notifyBookingPaid: vi.fn(async () => ({ smsSent: false })),
  notifyOwnerBookingPaid: vi.fn(),
  clubNotifyName: () => 'باشگاه',
  clubNotifyLocation: () => ({}),
  courtNotifyName: () => 'زمین ۳',
  ownerNotifyPhone: () => '09120000000',
  personNotifyName: () => 'بهناز',
}))
vi.mock('../../utils/payPin', () => ({ assignBookingPayPin: async () => 'PIN' }))
vi.mock('../../utils/receipt', () => ({ payUrlForPin: () => 'https://inboxs.ir/p/PIN' }))
vi.mock('../../utils/reservations', () => ({ activeSlotBooking: (b: unknown) => b }))
vi.mock('../../utils/onlinePaymentHold', () => ({ releaseExpiredOnlinePaymentHolds: vi.fn() }))
vi.mock('../../utils/settlement', () => ({ clawbackOwnerForPayment: vi.fn(), creditOwnerForPaidPayment: vi.fn() }))
vi.mock('../../utils/discountCodes', () => ({
  findDiscountCodeByInput: async () => null,
  assertDiscountUsable: vi.fn(),
}))
vi.mock('../../utils/contactSync', () => ({ syncClubContactForBooking: vi.fn() }))
vi.mock('../../utils/staleBooking', () => ({ deleteStaleCancelledBooking: vi.fn() }))

type Handler = (event: unknown) => Promise<unknown>
let reserve: Handler
beforeAll(async () => {
  reserve = (await import('./reserve.post')).default as unknown as Handler
})

beforeEach(() => {
  vi.clearAllMocks()
  process.env.PAYMENTS_MODE = 'pay_at_club'
})

function markCashBody() {
  // Same shape as calendar.vue deskCashPaymentBody: no discount fields.
  return {
    body: {
      slotId: 's1',
      guestName: 'بهناز',
      guestFamily: 'تعبدی',
      paymentMethod: 'CASH',
      paymentStatus: 'PAID',
      displayStatus: 'RESERVED',
      coachId: null,
    },
  }
}

describe('owner reserve re-save keeps the stored discount', () => {
  it('mark-cash-paid on a 50% code booking writes 240,000, not the 480,000 list price', async () => {
    await reserve(markCashBody())
    const args = upsert.mock.calls[0]![0] as { update: { amount: number, metadataJson?: string } }
    expect(args.update.amount).toBe(240_000)
    const meta = JSON.parse(args.update.metadataJson!)
    expect(meta).toMatchObject({ discountCode: 'HALF', discountPercent: 50, discountAmount: 240_000, subtotalBeforeDiscount: 480_000 })
  })

  it('keeps unrelated metadata flags while re-applying the discount', async () => {
    h.payment.metadataJson = JSON.stringify({ deskDiscountPercent: 25, markUnpaidCash: true })
    await reserve(markCashBody())
    const args = upsert.mock.calls[0]![0] as { update: { amount: number, metadataJson?: string } }
    expect(args.update.amount).toBe(360_000)
    expect(JSON.parse(args.update.metadataJson!)).toMatchObject({ deskDiscountPercent: 25, markUnpaidCash: true })
  })

  it('no stored discount: full list price, metadata untouched (unchanged behaviour)', async () => {
    h.payment.metadataJson = null
    await reserve(markCashBody())
    const args = upsert.mock.calls[0]![0] as { update: { amount: number, metadataJson?: string } }
    expect(args.update.amount).toBe(480_000)
    expect(args.update.metadataJson).toBeUndefined()
  })
})
