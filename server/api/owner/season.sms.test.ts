/** Owner season wizard: the athlete mobile the owner typed gets the season SMS. */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const createSeasonSessions = vi.fn()
const notifyBookingConfirmed = vi.fn()
const notifyBookingPaid = vi.fn()
const notifyOwnerBookingPaid = vi.fn()

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('createError', (e: { statusMessage?: string }) => new Error(e.statusMessage))
vi.stubGlobal('readBody', async (event: { body: unknown }) => event.body)
vi.stubGlobal('requireOwnerClub', async () => ({
  club: { id: 'club-1', nameFa: 'دانشگاه علم و صنعت', phone: null, owner: { phone: '09120000000' } },
}))

vi.mock('../../utils/recurringReserveGate', () => ({ assertRecurringReserveEnabled: () => undefined }))
vi.mock('../../utils/resolveOwnerCourts', () => ({ resolveOwnerCourtIds: async () => ['court-3'] }))
vi.mock('../../utils/seasonEdit', () => ({ applySeasonEdit: vi.fn() }))
vi.mock('../../utils/seasonReserve', () => ({
  createSeasonSessions: (...a: unknown[]) => createSeasonSessions(...a),
}))
vi.mock('../../utils/payPin', () => ({ assignBookingPayPin: async () => 'PIN12345' }))
vi.mock('../../utils/receipt', () => ({ payUrlForPin: (p: string) => `https://inboxs.ir/p/${p}` }))
vi.mock('../../utils/prisma', () => ({
  prisma: { court: { findMany: async () => [{ id: 'court-3', nameFa: 'زمین ۳', nameEn: 'Court 3' }] } },
}))
vi.mock('../../utils/bookingNotify', () => ({
  clubNotifyName: (c: { nameFa?: string }) => c.nameFa || 'باشگاه',
  clubNotifyLocation: () => ({}),
  courtNotifyName: (c: { nameFa?: string }) => c.nameFa || '',
  ownerNotifyPhone: () => '09120000000',
  personNotifyName: (...p: Array<string | null | undefined>) => p.filter(Boolean).join(' '),
  notifyBookingConfirmed: (...a: unknown[]) => notifyBookingConfirmed(...a),
  notifyBookingPaid: (...a: unknown[]) => notifyBookingPaid(...a),
  notifyOwnerBookingPaid: (...a: unknown[]) => notifyOwnerBookingPaid(...a),
}))

type Handler = (event: unknown) => Promise<{ smsSent?: boolean }>
let seasonPost: Handler
beforeAll(async () => {
  seasonPost = (await import('./season.post')).default as unknown as Handler
})

const sessions = [
  { date: '2026-11-15', startTime: '18:00', courtId: 'court-3' },
  { date: '2026-11-22', startTime: '18:00', courtId: 'court-3' },
]

function event(body: Record<string, unknown>) {
  return {
    body: {
      guestName: 'علی',
      guestFamily: 'رضایی',
      guestMobile: '09121111111',
      startDate: '2026-11-15',
      finishDate: '2026-11-22',
      sessions,
      ...body,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.PAYMENTS_MODE = 'live'
  createSeasonSessions.mockResolvedValue({
    seasonBookingId: 'season-1',
    primaryBookingId: 'b1',
    slotsCreated: 2,
    slotsSkipped: 0,
    conflicts: [],
    willCreate: sessions.map((s) => ({ ...s, endTime: '19:00' })),
    totalAmount: 10_000,
    payPin: 'PIN12345',
    payUrl: 'https://inboxs.ir/p/PIN12345',
  })
  notifyBookingConfirmed.mockResolvedValue(undefined)
  notifyBookingPaid.mockResolvedValue({ smsSent: true })
  notifyOwnerBookingPaid.mockResolvedValue(undefined)
})

describe('POST /api/owner/season — athlete SMS', () => {
  it('paid (cash) season: sends the athlete BOOKING_PAID SMS and reports smsSent', async () => {
    const res = await seasonPost(event({ paymentStatus: 'PAID', paymentMethod: 'CASH' }))
    expect(notifyBookingPaid).toHaveBeenCalledTimes(1)
    const opts = notifyBookingPaid.mock.calls[0]![0] as { skipGuest: boolean, phone: string, sessionCount: number }
    expect(opts.skipGuest).toBe(false)
    expect(opts.phone).toBe('09121111111')
    expect(opts.sessionCount).toBe(2)
    expect(res.smsSent).toBe(true)
    expect(notifyOwnerBookingPaid).toHaveBeenCalledTimes(1)
  })

  it('unpaid season: athlete gets the pay-link SMS path (guest not skipped, pin attached)', async () => {
    await seasonPost(event({ paymentStatus: 'PAY_AT_CLUB', paymentMethod: 'IPG' }))
    expect(notifyBookingPaid).not.toHaveBeenCalled()
    const opts = notifyBookingConfirmed.mock.calls[0]![0] as { skipGuest: boolean, payPin?: string, paymentPaid: boolean }
    expect(opts.skipGuest).toBe(false)
    expect(opts.paymentPaid).toBe(false)
    expect(opts.payPin).toBe('PIN12345')
  })

  it('no athlete mobile: club side only, no guest SMS attempted', async () => {
    await seasonPost(event({ guestMobile: '', paymentStatus: 'PAID' }))
    const opts = notifyBookingPaid.mock.calls[0]![0] as { skipGuest: boolean }
    expect(opts.skipGuest).toBe(true)
    expect(notifyOwnerBookingPaid).toHaveBeenCalledTimes(1)
  })
})
