import { beforeEach, describe, expect, it, vi } from 'vitest'

const deleteStaleCancelledBooking = vi.fn()

vi.mock('./staleBooking', () => ({
  deleteStaleCancelledBooking: (...args: unknown[]) => deleteStaleCancelledBooking(...args),
}))

const courtRow = {
  id: 'court-3',
  clubId: 'club-1',
  price: 500000,
  pricingJson: null,
  openHour: 7,
  closeHour: 24,
  club: { openHour: 7, closeHour: 24, defaultSessionDurationMinutes: 60 },
}

const mockTx = {
  slot: {
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    create: vi.fn(),
  },
  booking: { create: vi.fn().mockResolvedValue({ id: 'new-booking' }) },
  payment: { create: vi.fn() },
  reservationEvent: { create: vi.fn() },
}

vi.mock('./prisma', () => ({
  prisma: {
    seasonBooking: {
      create: vi.fn().mockResolvedValue({ id: 'season-new', finishDate: '2026-12-17' }),
    },
    court: {
      findMany: vi.fn().mockResolvedValue([courtRow]),
      findFirst: vi.fn().mockResolvedValue(courtRow),
    },
    slot: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'slot-1',
        displayStatus: 'FREE',
        booking: { id: 'stale-cancelled', status: 'CANCELLED' },
      }),
    },
    payment: {
      findUnique: vi.fn().mockResolvedValue({ id: 'pay-1', metadataJson: '{}' }),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<string | null>) => fn(mockTx)),
  },
}))

vi.mock('./phoneAuth', () => ({ ensureAthleteUserForOwnerDesk: vi.fn().mockResolvedValue(null) }))
vi.mock('./slots', () => ({
  ensureSlotsForDate: vi.fn(),
  formatHour: (h: number) => `${String(h).padStart(2, '0')}:00`,
  hourEnd: (h: number) => `${String(h + 1).padStart(2, '0')}:00`,
  addMinutes: () => '19:00',
}))
vi.mock('./seasonDiscount', () => ({
  resolveSeasonSeriesCharge: vi.fn().mockResolvedValue({
    chargedTotal: 500000,
    discountAmount: 0,
    paymentMetadata: null,
    redeemDiscountId: null,
  }),
  seasonSessionPaymentAmount: () => ({ amount: 500000, remainingDiscount: 0 }),
  redeemSeasonAthleteDiscount: vi.fn(),
}))
vi.mock('./contactSync', () => ({ syncClubContactForBooking: vi.fn() }))

describe('createSeasonSessions — reclaim FREE slot with CANCELLED booking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('passes booking id when deleting a stale cancelled row before re-book', async () => {
    const { createSeasonSessions } = await import('./seasonReserve')

    await createSeasonSessions({
      clubId: 'club-1',
      sessions: [{ date: '2026-12-03', startTime: '16:00', courtId: 'court-3' }],
      guestName: 'الهه',
      guestFamily: 'صالحی',
      guestMobile: '09120735241',
      paymentMethod: 'CASH',
      paymentStatus: 'PAID',
    })

    expect(deleteStaleCancelledBooking).toHaveBeenCalledWith(expect.anything(), 'stale-cancelled')
  })
})