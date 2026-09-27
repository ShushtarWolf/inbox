import { beforeEach, describe, expect, it, vi } from 'vitest'

const findUnique = vi.fn()
const findMany = vi.fn()

vi.stubGlobal('prisma', {
  payment: { findUnique: (...args: unknown[]) => findUnique(...args) },
  booking: { findMany: (...args: unknown[]) => findMany(...args) },
})

vi.mock('./payments/service', () => ({ getPaymentService: () => ({}) }))
vi.mock('./refunds', () => ({ refundPaymentForCancellation: vi.fn() }))
vi.mock('./wallet', () => ({ creditWalletForTopUpPayment: vi.fn() }))
vi.mock('./settlement', () => ({ creditOwnerForPaidPayment: vi.fn() }))
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
  notifyBookingPaid: vi.fn(),
  notifyOwnerBookingPaid: vi.fn(),
  ownerNotifyPhone: () => '09120000000',
  personNotifyName: (given?: string, family?: string) => [given, family].filter(Boolean).join(' '),
}))

import { notifyBookingPaid, notifyOwnerBookingPaid } from './bookingNotify'
import { notifyPaymentPaidIfNeeded } from './paymentSync'

function slot(date: string, start = '09:00', end = '10:00') {
  return {
    date,
    startTime: start,
    endTime: end,
    court: {
      nameFa: 'زمین ۳',
      club: { id: 'club-1', nameFa: 'دانشگاه', owner: { phone: '09120000000' } },
    },
  }
}

function paidCourt(opts: { metadataJson?: string | null; date?: string }) {
  return {
    id: 'pay-1',
    status: 'PAID',
    amount: 400000,
    metadataJson: opts.metadataJson ?? null,
    booking: {
      id: 'b1',
      userId: 'u1',
      guestName: 'بهناز',
      guestFamily: 'تعبدی',
      guestMobile: '09121111111',
      user: { phone: '09121111111', email: 'a@b.c', name: 'بهناز' },
      slot: slot(opts.date || '2026-09-28'),
    },
    coachSession: null,
    packageBooking: null,
  }
}

describe('notifyPaymentPaidIfNeeded season sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists every sibling day on the paid guest and owner SMS', async () => {
    findUnique.mockResolvedValue(paidCourt({
      metadataJson: JSON.stringify({
        groupPrimaryBookingId: 'b1',
        groupSiblingBookingIds: ['b2', 'b3', 'b4'],
      }),
    }))
    findMany.mockResolvedValue([
      { id: 'b2', status: 'CONFIRMED', slot: slot('2026-10-12') },
      { id: 'b1', status: 'CONFIRMED', slot: slot('2026-09-28') },
      { id: 'b4', status: 'CONFIRMED', slot: slot('2026-10-19') },
      { id: 'b3', status: 'CONFIRMED', slot: slot('2026-10-05') },
    ])

    await notifyPaymentPaidIfNeeded('pay-1', 'PENDING_ONLINE')

    const sessions = [
      { courtName: 'زمین ۳', date: '2026-09-28', startTime: '09:00', endTime: '10:00' },
      { courtName: 'زمین ۳', date: '2026-10-05', startTime: '09:00', endTime: '10:00' },
      { courtName: 'زمین ۳', date: '2026-10-12', startTime: '09:00', endTime: '10:00' },
      { courtName: 'زمین ۳', date: '2026-10-19', startTime: '09:00', endTime: '10:00' },
    ]
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['b1', 'b2', 'b3', 'b4'] }, status: { not: 'CANCELLED' } },
    }))
    expect(notifyBookingPaid).toHaveBeenCalledWith(expect.objectContaining({
      sessions,
      sessionCount: 4,
      date: '2026-09-28',
      finishDate: '2026-10-19',
    }))
    expect(notifyOwnerBookingPaid).toHaveBeenCalledWith(expect.objectContaining({ sessions }))
  })

  it('keeps a single-slot SMS when the payment is not a series', async () => {
    findUnique.mockResolvedValue(paidCourt({}))

    await notifyPaymentPaidIfNeeded('pay-1', 'PENDING_ONLINE')

    expect(findMany).not.toHaveBeenCalled()
    expect(notifyBookingPaid).toHaveBeenCalledWith(expect.objectContaining({
      date: '2026-09-28',
      sessions: undefined,
      sessionCount: undefined,
    }))
  })
})
