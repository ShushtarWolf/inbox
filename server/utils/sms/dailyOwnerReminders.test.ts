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
} from './dailyOwnerReminders'

function bookingRow(opts: {
  clubId: string
  ownerPhone?: string | null
  clubPhone?: string | null
}) {
  return {
    slot: {
      court: {
        club: {
          id: opts.clubId,
          phone: opts.clubPhone ?? null,
          owner: { phone: opts.ownerPhone ?? null },
        },
      },
    },
  }
}

describe('processDailyOwnerReservationReminders', () => {
  const prevSiteUrl = process.env.NUXT_PUBLIC_SITE_URL

  beforeEach(() => {
    findMany.mockReset()
    findFirst.mockReset()
    sendSms.mockReset()
    resolveSmsProvider.mockReturnValue('log')
    findFirst.mockResolvedValue(null)
    sendSms.mockResolvedValue({ sent: false, logged: true })
    process.env.NUXT_PUBLIC_SITE_URL = 'https://inboxs.ir'
  })

  afterEach(() => {
    if (prevSiteUrl === undefined) delete process.env.NUXT_PUBLIC_SITE_URL
    else process.env.NUXT_PUBLIC_SITE_URL = prevSiteUrl
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

  it('sends one short SMS per club with the owner calendar URL', async () => {
    findMany.mockResolvedValue([
      bookingRow({ clubId: 'club-1', ownerPhone: '09121111111' }),
      bookingRow({ clubId: 'club-1', ownerPhone: '09121111111' }),
    ])

    const result = await processDailyOwnerReservationReminders({ date: '2026-08-16' })
    expect(result.sent).toBe(1)
    expect(result.clubsWithReservations).toBe(1)
    expect(sendSms).toHaveBeenCalledOnce()
    const arg = sendSms.mock.calls[0]![0] as { to: string; body: string; template: string; purpose: string }
    expect(arg.to).toBe('09121111111')
    expect(arg.purpose).toBe('notify')
    expect(arg.template).toBe(dailyOwnerReminderCampaignName('2026-08-16'))
    expect(arg.body).toBe(
      [
        'صاحب باشگاه عزیز',
        'شما از سایت اینباکس رزرو دارید',
        '',
        'https://inboxs.ir/owner/calendar',
      ].join('\n'),
    )
    expect(arg.body).not.toMatch(/زمین|علی|مهمان|جمع:/)
  })

  it('sends one SMS per club in live mode (no token10 chunking)', async () => {
    resolveSmsProvider.mockReturnValue('live')
    sendSms.mockResolvedValue({ sent: true, logged: true })
    findMany.mockResolvedValue(
      Array.from({ length: 20 }, () => bookingRow({ clubId: 'club-1', ownerPhone: '09121111111' })),
    )
    const result = await processDailyOwnerReservationReminders({ date: '2026-08-16' })
    expect(result.sent).toBe(1)
    expect(sendSms).toHaveBeenCalledOnce()
  })

  it('skips clubs without a mobile owner/club phone', async () => {
    findMany.mockResolvedValue([
      bookingRow({
        clubId: 'club-landline',
        ownerPhone: null,
        clubPhone: '02111111111',
      }),
    ])
    const result = await processDailyOwnerReservationReminders({ date: '2026-08-16' })
    expect(result.sent).toBe(0)
    expect(result.skippedNoPhone).toBe(1)
    expect(sendSms).not.toHaveBeenCalled()
  })

  it('skips when already sent for that date (SmsLog idempotency)', async () => {
    findMany.mockResolvedValue([
      bookingRow({ clubId: 'club-1', ownerPhone: '09121111111' }),
    ])
    findFirst.mockResolvedValue({ id: 'log-1' })
    const result = await processDailyOwnerReservationReminders({ date: '2026-08-16' })
    expect(result.sent).toBe(0)
    expect(result.skippedAlreadySent).toBe(1)
    expect(sendSms).not.toHaveBeenCalled()
  })
})
