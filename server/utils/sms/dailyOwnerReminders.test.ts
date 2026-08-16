import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const findMany = vi.fn()
const findFirst = vi.fn()
const sendSms = vi.fn()
const resolveSmsProvider = vi.fn()

vi.mock('#shared/sms.ts', () => ({
  resolveSmsProvider: () => resolveSmsProvider(),
}))

vi.mock('./service', () => ({
  sendSms: (...args: unknown[]) => sendSms(...args),
}))

vi.stubGlobal('prisma', {
  booking: { findMany },
  smsLog: { findFirst },
})

import {
  dailyOwnerReminderCampaignName,
  processDailyOwnerReservationReminders,
  reservationGuestLabel,
} from './dailyOwnerReminders'

function bookingRow(opts: {
  clubId: string
  clubName?: string
  ownerPhone?: string | null
  clubPhone?: string | null
  court?: string
  start: string
  end: string
  guestName?: string | null
  guestFamily?: string | null
  guestMobile?: string | null
  userName?: string | null
  userPhone?: string | null
}) {
  return {
    guestName: opts.guestName ?? null,
    guestFamily: opts.guestFamily ?? null,
    guestMobile: opts.guestMobile ?? null,
    user: opts.userName || opts.userPhone
      ? { name: opts.userName ?? null, phone: opts.userPhone ?? null }
      : null,
    slot: {
      startTime: opts.start,
      endTime: opts.end,
      court: {
        nameFa: opts.court || 'زمین ۱',
        nameEn: 'Court 1',
        club: {
          id: opts.clubId,
          nameFa: opts.clubName || 'بهناز',
          nameEn: 'Behnaz',
          phone: opts.clubPhone ?? null,
          owner: { phone: opts.ownerPhone ?? null },
        },
      },
    },
  }
}

describe('reservationGuestLabel', () => {
  it('prefers guest name, then user name, then مهمان with phone', () => {
    expect(reservationGuestLabel({ guestName: 'علی', guestFamily: 'رضایی' })).toBe('علی رضایی')
    expect(reservationGuestLabel({ user: { name: 'سارا' } })).toBe('سارا')
    expect(reservationGuestLabel({ guestMobile: '09121234567' })).toBe('مهمان (۰۹۱۲۱۲۳۴۵۶۷)')
    expect(reservationGuestLabel({})).toBe('مهمان')
  })
})

describe('processDailyOwnerReservationReminders', () => {
  beforeEach(() => {
    findMany.mockReset()
    findFirst.mockReset()
    sendSms.mockReset()
    resolveSmsProvider.mockReturnValue('log')
    findFirst.mockResolvedValue(null)
    sendSms.mockResolvedValue({ sent: false, logged: true })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('sends nothing when no clubs have reservations that day', async () => {
    findMany.mockResolvedValue([])
    const result = await processDailyOwnerReservationReminders({ date: '2026-08-16' })
    expect(result.sent).toBe(0)
    expect(result.clubsWithReservations).toBe(0)
    expect(result.note).toContain('nothing to send')
    expect(sendSms).not.toHaveBeenCalled()
  })

  it('sends one multi-line SMS per club with reservations', async () => {
    findMany.mockResolvedValue([
      bookingRow({
        clubId: 'club-1',
        ownerPhone: '09121111111',
        court: 'زمین ۱',
        start: '09:00',
        end: '10:00',
        guestName: 'علی',
        guestFamily: 'رضایی',
      }),
      bookingRow({
        clubId: 'club-1',
        ownerPhone: '09121111111',
        court: 'زمین ۳',
        start: '19:00',
        end: '20:00',
        guestMobile: '09121234567',
      }),
    ])

    const result = await processDailyOwnerReservationReminders({ date: '2026-08-16' })
    expect(result.sent).toBe(1)
    expect(result.clubsWithReservations).toBe(1)
    expect(sendSms).toHaveBeenCalledOnce()
    const arg = sendSms.mock.calls[0]![0] as { to: string; body: string; template: string }
    expect(arg.to).toBe('09121111111')
    expect(arg.template).toBe(dailyOwnerReminderCampaignName('2026-08-16'))
    expect(arg.body).toContain('یادآوری رزرو — باشگاه بهناز')
    expect(arg.body).toContain('• زمین ۱ | ۰۹:۰۰–۱۰:۰۰ | علی رضایی')
    expect(arg.body).toContain('• زمین ۳ | ۱۹:۰۰–۲۰:۰۰ | مهمان (۰۹۱۲۱۲۳۴۵۶۷)')
    expect(arg.body).toContain('جمع: ۲ رزرو')
    expect(arg.body).toContain('اینباکس')
  })

  it('skips clubs without a mobile owner/club phone', async () => {
    findMany.mockResolvedValue([
      bookingRow({
        clubId: 'club-landline',
        ownerPhone: null,
        clubPhone: '02111111111',
        start: '10:00',
        end: '11:00',
        guestName: 'سارا',
      }),
    ])
    const result = await processDailyOwnerReservationReminders({ date: '2026-08-16' })
    expect(result.sent).toBe(0)
    expect(result.skippedNoPhone).toBe(1)
    expect(sendSms).not.toHaveBeenCalled()
  })

  it('skips when already sent for that date (SmsLog idempotency)', async () => {
    findMany.mockResolvedValue([
      bookingRow({
        clubId: 'club-1',
        ownerPhone: '09121111111',
        start: '10:00',
        end: '11:00',
        guestName: 'سارا',
      }),
    ])
    findFirst.mockResolvedValue({ id: 'log-1' })
    const result = await processDailyOwnerReservationReminders({ date: '2026-08-16' })
    expect(result.sent).toBe(0)
    expect(result.skippedAlreadySent).toBe(1)
    expect(sendSms).not.toHaveBeenCalled()
  })
})
