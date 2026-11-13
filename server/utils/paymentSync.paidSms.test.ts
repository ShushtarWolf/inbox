/**
 * Paid SMS (guest BOOKING_PAID + club «سفارش جدید») must go out exactly once when a payment
 * becomes PAID, even if post-commit bookkeeping throws, and an SMS failure must never undo money.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const paymentFindUnique = vi.fn()
const paymentFindFirst = vi.fn()
const bookingFindUnique = vi.fn()
const bookingUpdate = vi.fn()
const confirm = vi.fn()
const creditOwnerForPaidPayment = vi.fn()
const notifyBookingPaid = vi.fn()
const notifyOwnerBookingPaid = vi.fn()

vi.stubGlobal('prisma', {
  payment: {
    findUnique: (...args: unknown[]) => paymentFindUnique(...args),
    findFirst: (...args: unknown[]) => paymentFindFirst(...args),
  },
  booking: {
    findUnique: (...args: unknown[]) => bookingFindUnique(...args),
    update: (...args: unknown[]) => bookingUpdate(...args),
    findMany: vi.fn().mockResolvedValue([]),
  },
})

vi.mock('./payments/service', () => ({ getPaymentService: () => ({ confirm }) }))
vi.mock('./refunds', () => ({ refundPaymentForCancellation: vi.fn() }))
vi.mock('./wallet', () => ({ creditWalletForTopUpPayment: vi.fn() }))
vi.mock('./settlement', () => ({
  creditOwnerForPaidPayment: (...args: unknown[]) => creditOwnerForPaidPayment(...args),
}))
vi.mock('./moneyJobs', () => ({
  enqueueMoneyJobsForPaidPayment: vi.fn().mockResolvedValue({ enqueued: 1 }),
  markMoneyJobsDoneForPaidPayment: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./splitPayWallet', () => ({ promoteSplitPayAmountOnPaid: vi.fn() }))
vi.mock('./competitions', () => ({
  confirmEntryFromPayment: vi.fn(),
  findCompetitionLatePayTarget: vi.fn(),
}))
vi.mock('./onlinePaymentHold', () => ({ promoteOnlineHoldOnPaid: vi.fn() }))
vi.mock('./contactSync', () => ({ syncClubContactForBooking: vi.fn() }))
vi.mock('./adminNotify', () => ({ notifyAdminWalletTopUp: vi.fn() }))
vi.mock('./bookingNotify', () => ({
  clubNotifyName: (club: { nameFa?: string }) => club.nameFa || 'باشگاه',
  courtNotifyName: (court: { nameFa?: string }) => court.nameFa || '',
  notifyBookingPaid: (...args: unknown[]) => notifyBookingPaid(...args),
  notifyOwnerBookingPaid: (...args: unknown[]) => notifyOwnerBookingPaid(...args),
  ownerNotifyPhone: () => '09120000000',
  personNotifyName: (given?: string, family?: string) => [given, family].filter(Boolean).join(' '),
  skipGuestBookingSms: (booking: { source?: string | null }) => booking.source === 'CLUB',
}))

import { confirmPaymentAndSync, runPaidBookkeepingThenNotify } from './paymentSync'

const paidPayment = {
  id: 'pay-1',
  status: 'PAID',
  method: 'IPG',
  purpose: 'booking',
  amount: 5000,
  bookingId: 'b1',
  metadataJson: null,
  booking: {
    id: 'b1',
    source: 'PLATFORM',
    userId: 'u1',
    guestName: 'بهناز',
    guestFamily: 'تعبدی',
    guestMobile: '09121111111',
    user: { phone: '09121111111', email: null, name: 'بهناز' },
    slot: {
      date: '2026-11-13',
      startTime: '09:00',
      endTime: '10:00',
      court: { nameFa: 'زمین ۳', club: { id: 'club-1', nameFa: 'دانشگاه', owner: { phone: '09120000000' } } },
    },
  },
  coachSession: null,
  packageBooking: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  paymentFindUnique.mockResolvedValue(paidPayment)
  bookingFindUnique.mockResolvedValue({ id: 'b1', status: 'CONFIRMED' })
  bookingUpdate.mockResolvedValue({})
  creditOwnerForPaidPayment.mockResolvedValue({ credited: true })
  notifyBookingPaid.mockResolvedValue({ smsSent: true })
  notifyOwnerBookingPaid.mockResolvedValue(undefined)
  confirm.mockResolvedValue({ id: 'pay-1', status: 'PAID', amount: 5000, provider: 'sep', providerRef: 'ref-1' })
})

describe('runPaidBookkeepingThenNotify (wallet checkout + IPG confirm)', () => {
  it('sends guest + owner paid SMS once after bookkeeping', async () => {
    const steps = vi.fn().mockResolvedValue(undefined)
    await runPaidBookkeepingThenNotify('pay-1', 'PENDING_ONLINE', steps)
    expect(steps).toHaveBeenCalledTimes(1)
    expect(notifyBookingPaid).toHaveBeenCalledTimes(1)
    expect(notifyOwnerBookingPaid).toHaveBeenCalledTimes(1)
  })

  it('still sends the SMS when a bookkeeping step throws, then rethrows', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(runPaidBookkeepingThenNotify('pay-1', 'PENDING_ONLINE', async () => {
      throw new Error('settle failed')
    })).rejects.toThrow('settle failed')
    expect(notifyBookingPaid).toHaveBeenCalledTimes(1)
    expect(notifyOwnerBookingPaid).toHaveBeenCalledTimes(1)
    err.mockRestore()
  })

  it('no SMS when the payment was already PAID (replay / concurrent loser)', async () => {
    await runPaidBookkeepingThenNotify('pay-1', 'PAID', async () => {})
    await runPaidBookkeepingThenNotify('pay-1', 'PENDING_ONLINE', async () => {}, { notify: false })
    expect(notifyBookingPaid).not.toHaveBeenCalled()
    expect(notifyOwnerBookingPaid).not.toHaveBeenCalled()
  })

  it('SMS failure never throws and never re-runs or undoes bookkeeping', async () => {
    notifyBookingPaid.mockRejectedValue(new Error('kavenegar down'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const steps = vi.fn().mockResolvedValue(undefined)
    await expect(runPaidBookkeepingThenNotify('pay-1', 'PENDING_ONLINE', steps)).resolves.toBeUndefined()
    expect(steps).toHaveBeenCalledTimes(1)
    err.mockRestore()
  })

  it('payment lookup failure inside notify is swallowed', async () => {
    paymentFindUnique.mockRejectedValue(new Error('db blip'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(runPaidBookkeepingThenNotify('pay-1', 'PENDING_ONLINE', async () => {})).resolves.toBeUndefined()
    err.mockRestore()
  })
})

describe('confirmPaymentAndSync (IPG callback / webhook)', () => {
  it('sends paid SMS once on the first PAID confirm', async () => {
    paymentFindFirst.mockResolvedValue({ id: 'pay-1', status: 'PENDING_ONLINE', bookingId: 'b1', booking: { id: 'b1', status: 'CONFIRMED', userId: 'u1' }, metadataJson: null, purpose: 'booking' })
    await confirmPaymentAndSync('ref-1', 'sep')
    expect(notifyBookingPaid).toHaveBeenCalledTimes(1)
    expect(notifyOwnerBookingPaid).toHaveBeenCalledTimes(1)
  })

  it('settlement throwing no longer swallows the paid SMS', async () => {
    paymentFindFirst.mockResolvedValue({ id: 'pay-1', status: 'PENDING_ONLINE', bookingId: 'b1', booking: { id: 'b1', status: 'CONFIRMED', userId: 'u1' }, metadataJson: null, purpose: 'booking' })
    creditOwnerForPaidPayment.mockRejectedValue(new Error('ledger conflict'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(confirmPaymentAndSync('ref-1', 'sep')).rejects.toThrow('ledger conflict')
    expect(notifyBookingPaid).toHaveBeenCalledTimes(1)
    expect(notifyOwnerBookingPaid).toHaveBeenCalledTimes(1)
    err.mockRestore()
  })

  it('second callback for an already PAID payment sends nothing', async () => {
    paymentFindFirst.mockResolvedValue({ id: 'pay-1', status: 'PAID', bookingId: 'b1', booking: { id: 'b1', status: 'CONFIRMED', userId: 'u1' }, metadataJson: null, purpose: 'booking' })
    await confirmPaymentAndSync('ref-1', 'sep')
    expect(notifyBookingPaid).not.toHaveBeenCalled()
    expect(notifyOwnerBookingPaid).not.toHaveBeenCalled()
  })
})
