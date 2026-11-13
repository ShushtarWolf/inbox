/**
 * Booking + cancel SMS through the real notify pipeline with a mocked SMS provider.
 * Asserts each path sends its SMS exactly once and that provider/render failures never throw.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sendSms = vi.fn()
const clubFindUnique = vi.fn()
const renderOverride = vi.fn()

vi.stubGlobal('prisma', {
  club: { findUnique: (...args: unknown[]) => clubFindUnique(...args) },
  notification: { create: vi.fn().mockResolvedValue({}) },
})
vi.mock('./prisma', () => ({
  prisma: {
    club: { findUnique: (...args: unknown[]) => clubFindUnique(...args) },
    notification: { create: vi.fn().mockResolvedValue({}) },
  },
}))
vi.mock('./sms/service', () => ({
  sendSms: (...args: unknown[]) => sendSms(...args),
}))
vi.mock('./sms/templates', async (importOriginal) => {
  const real = await importOriginal<typeof import('./sms/templates')>()
  return {
    ...real,
    renderSmsTemplate: (...args: Parameters<typeof real.renderSmsTemplate>) => {
      const forced = renderOverride(...args)
      if (forced instanceof Error) throw forced
      return real.renderSmsTemplate(...args)
    },
  }
})

import {
  maskPhone,
  notifyBookingCancelled,
  notifyBookingPaid,
  notifyOwnerBookingCancelled,
  notifyOwnerBookingPaid,
  notifySmsSoft,
} from './bookingNotify'

const ENV_KEYS = ['SMS_PROVIDER', 'SMS_ENABLED', 'KAVENEGAR_API_KEY', 'KAVENEGAR_TEMPLATE', 'ADMIN_ALERT_SMS'] as const
const saved: Record<string, string | undefined> = {}

const athlete = {
  userId: 'u1',
  email: null,
  phone: '09121111111',
  clubName: 'دانشگاه علم و صنعت',
  clubId: 'club-1',
  bookingId: 'b1',
  kind: 'court' as const,
  date: '2026-11-13',
  startTime: '09:00',
  endTime: '10:00',
  courtName: 'زمین ۳',
  guestName: 'بهناز تعبدی',
}

const owner = {
  ownerPhone: '09120000000',
  clubName: 'دانشگاه علم و صنعت',
  clubId: 'club-1',
  bookingId: 'b1',
  date: '2026-11-13',
  startTime: '09:00',
  endTime: '10:00',
  courtName: 'زمین ۳',
  guestName: 'بهناز تعبدی',
  guestPhone: '09121111111',
}

function smsCalls(template: string) {
  return sendSms.mock.calls.filter((c) => c[0]?.template === template)
}

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k]
  process.env.SMS_PROVIDER = 'live'
  process.env.SMS_ENABLED = 'true'
  process.env.KAVENEGAR_API_KEY = 'test-key-not-real'
  process.env.KAVENEGAR_TEMPLATE = 'inbox-verify'
  process.env.ADMIN_ALERT_SMS = 'false'
  sendSms.mockResolvedValue({ sent: true, logged: true, providerRef: 'kavenegar-1' })
  renderOverride.mockReturnValue(undefined)
  // Owner mobile + a distinct bookingNotifyPhone → two club-side recipients.
  clubFindUnique.mockResolvedValue({ bookingNotifyPhone: '09350000000', owner: { phone: '09120000000' } })
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  vi.clearAllMocks()
})

describe('booking SMS is sent once per path', () => {
  it('paid (IPG / wallet / desk paid) → one guest BOOKING_PAID', async () => {
    const res = await notifyBookingPaid({ ...athlete, paymentPaid: true, amountPaid: 5000 })
    expect(res.smsSent).toBe(true)
    expect(smsCalls('BOOKING_PAID')).toHaveLength(1)
    expect(smsCalls('BOOKING_PAID')[0]![0].to).toBe('09121111111')
  })

  it('paid → one «سفارش جدید» per club-side phone (owner + bookingNotifyPhone)', async () => {
    await notifyOwnerBookingPaid({ ...owner, amountPaid: 5000 })
    const calls = smsCalls('OWNER_BOOKING_CONFIRMED')
    expect(calls.map((c) => c[0].to).sort()).toEqual(['09120000000', '09350000000'])
  })

  it('desk (CLUB source) skips the guest but still alerts the club', async () => {
    await notifyBookingPaid({ ...athlete, paymentPaid: true, skipGuest: true })
    await notifyOwnerBookingPaid({ ...owner })
    expect(smsCalls('BOOKING_PAID')).toHaveLength(0)
    expect(smsCalls('OWNER_BOOKING_CONFIRMED')).toHaveLength(2)
  })

  it('cancel (athlete / owner / coach) → one guest BOOKING_CANCELLED', async () => {
    await notifyBookingCancelled({ ...athlete, reason: 'owner-cancel' })
    expect(smsCalls('BOOKING_CANCELLED')).toHaveLength(1)
  })

  it('cancel → one OWNER_BOOKING_CANCELLED per club-side phone', async () => {
    await notifyOwnerBookingCancelled(owner)
    expect(smsCalls('OWNER_BOOKING_CANCELLED').map((c) => c[0].to).sort()).toEqual(['09120000000', '09350000000'])
  })

  it('dedupes when bookingNotifyPhone equals the owner mobile', async () => {
    clubFindUnique.mockResolvedValue({ bookingNotifyPhone: '09120000000', owner: { phone: '09120000000' } })
    await notifyOwnerBookingCancelled(owner)
    expect(smsCalls('OWNER_BOOKING_CANCELLED')).toHaveLength(1)
  })
})

describe('SMS failure never breaks the caller', () => {
  it('provider throws (credit exhausted / template rejected) → resolves, reports not sent', async () => {
    sendSms.mockRejectedValue(new Error('Kavenegar SMS failed: 418 credit'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(notifyBookingPaid({ ...athlete, paymentPaid: true })).resolves.toEqual({ smsSent: false })
    await expect(notifyBookingCancelled({ ...athlete })).resolves.toBeUndefined()
    await expect(notifyOwnerBookingCancelled(owner)).resolves.toBeUndefined()
    await expect(notifyOwnerBookingPaid(owner)).resolves.toBeUndefined()
    expect(err.mock.calls.some((c) => c[0] === '[sms:notify:not_sent]')).toBe(true)
    err.mockRestore()
  })

  it('template render throws → resolves false instead of propagating', async () => {
    renderOverride.mockReturnValue(new Error('bad data'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(notifySmsSoft('09121111111', 'BOOKING_CANCELLED', {}, 'club-1')).resolves.toBe(false)
    expect(sendSms).not.toHaveBeenCalled()
    err.mockRestore()
  })

  it('club recipients lookup fails → owner cancel SMS resolves without throwing', async () => {
    clubFindUnique.mockRejectedValue(new Error('db down'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(notifyOwnerBookingCancelled(owner)).resolves.toBeUndefined()
    err.mockRestore()
  })
})

describe('maskPhone', () => {
  it('keeps prefix and last four only', () => {
    expect(maskPhone('09121234567')).toBe('0912***4567')
    expect(maskPhone(null)).toBe('-')
  })
})
