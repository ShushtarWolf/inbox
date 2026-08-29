import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createInAppNotification = vi.fn()
const sendNotification = vi.fn()
const resolveSmsProvider = vi.fn()
const sendSms = vi.fn()

vi.mock('./notify', () => ({
  createInAppNotification: (...args: unknown[]) => createInAppNotification(...args),
  sendNotification: (...args: unknown[]) => sendNotification(...args),
}))

vi.mock('#shared/sms.ts', () => ({
  resolveSmsProvider: () => resolveSmsProvider(),
}))

vi.mock('./sms/service', () => ({
  sendSms: (...args: unknown[]) => sendSms(...args),
}))

import {
  clubNotifyLocation,
  clubNotifyName,
  notifyBookingCancelled,
  notifyBookingConfirmed,
  notifyBookingPaid,
  notifyOwnerBookingCancelled,
  notifyOwnerBookingPaid,
  ownerNotifyPhone,
  personNotifyName,
} from './bookingNotify'

const baseOpts = {
  userId: 'user-1',
  email: 'athlete@inbox.local',
  phone: '09121234567',
  clubName: 'باشگاه تست',
  date: '2026-07-20',
  startTime: '10:00',
  kind: 'court' as const,
  bookingId: 'booking-1',
  clubId: 'club-1',
}

const guestOnlyOpts = {
  userId: null,
  email: null,
  phone: '09129876543',
  clubName: 'بهناز',
  date: '2026-07-21',
  startTime: '14:00',
  kind: 'court' as const,
  bookingId: 'booking-guest-1',
  clubId: 'club-behnaz',
}

describe('clubNotifyName', () => {
  it('prefers Persian name', () => {
    expect(clubNotifyName({ nameFa: 'بهناز', nameEn: 'Behnaz' })).toBe('بهناز')
    expect(clubNotifyName({ nameFa: null, nameEn: 'Behnaz' })).toBe('Behnaz')
    expect(clubNotifyName({})).toBe('باشگاه')
  })

  it('joins guest first and last name', () => {
    expect(personNotifyName('علی', 'رضایی')).toBe('علی رضایی')
    expect(personNotifyName('  علی  ', '', null)).toBe('علی')
  })

  it('prefers owner phone then club phone', () => {
    expect(ownerNotifyPhone({ phone: '021111', owner: { phone: '09120000000' } })).toBe('09120000000')
    expect(ownerNotifyPhone({ phone: '021111', owner: { phone: null } })).toBeNull()
    expect(ownerNotifyPhone({ phone: '09121112233', owner: { phone: null } })).toBe('09121112233')
    expect(ownerNotifyPhone({ phone: null, owner: null })).toBeNull()
  })

  it('builds maps url when lat/lng exist', () => {
    expect(clubNotifyLocation({ addressFa: 'سعادت‌آباد', lat: 35.7, lng: 51.4 })).toEqual({
      address: 'سعادت‌آباد',
      mapsUrl: 'https://maps.google.com/?q=35.7,51.4',
    })
    expect(clubNotifyLocation({ addressFa: 'تهران' })).toEqual({
      address: 'تهران',
      mapsUrl: '',
    })
  })
})

describe('bookingNotify SMS', () => {
  beforeEach(() => {
    process.env.ADMIN_ALERT_SMS = 'false'
    createInAppNotification.mockResolvedValue(undefined)
    sendNotification.mockResolvedValue({ sent: false, logged: true })
    sendSms.mockResolvedValue({ sent: false, logged: true })
    resolveSmsProvider.mockReturnValue('log')
  })

  afterEach(() => {
    vi.clearAllMocks()
    delete process.env.ADMIN_ALERT_SMS
    delete process.env.ADMIN_ALERT_PHONE
    delete process.env.KAVENEGAR_TEMPLATE_PAY_LINK
  })

  it('alerts platform admin even when guest SMS is skipped', async () => {
    delete process.env.ADMIN_ALERT_SMS
    process.env.ADMIN_ALERT_PHONE = '09124777927'
    resolveSmsProvider.mockReturnValue('live')
    sendNotification.mockResolvedValue({ sent: true })

    await notifyBookingConfirmed({ ...baseOpts, phone: null, skipGuest: true })
    await notifyBookingPaid({ ...baseOpts, phone: null, skipGuest: true })
    await notifyBookingCancelled({ ...baseOpts, phone: null, skipGuest: true })

    const adminCalls = sendNotification.mock.calls
      .filter((call) => call[0]?.channel === 'sms' && String(call[0].template).startsWith('ADMIN_'))
    expect(adminCalls).toHaveLength(3)
    expect(adminCalls.map((call) => call[0].template)).toEqual([
      'ADMIN_BOOKING_CONFIRMED',
      'ADMIN_BOOKING_PAID',
      'ADMIN_BOOKING_CANCELLED',
    ])
    for (const call of adminCalls) {
      expect(call[0].to).toBe('09124777927')
    }
  })

  it('attempts SMS when provider is live and phone is present', async () => {
    resolveSmsProvider.mockReturnValue('live')
    sendNotification.mockResolvedValue({ sent: true })

    await notifyBookingConfirmed(baseOpts)
    await notifyBookingCancelled({ ...baseOpts, reason: 'test' })
    await notifyBookingPaid(baseOpts)

    const smsCalls = sendNotification.mock.calls.filter((call) => call[0]?.channel === 'sms')
    expect(smsCalls).toHaveLength(3)
    expect(smsCalls.map((call) => call[0].template)).toEqual([
      'BOOKING_CONFIRMED',
      'BOOKING_CANCELLED',
      'BOOKING_PAID',
    ])
    for (const call of smsCalls) {
      expect(call[0]).toMatchObject({
        channel: 'sms',
        to: '09121234567',
        clubId: 'club-1',
      })
    }
  })

  it('dry-runs SMS in log mode (auditable body, no live claim)', async () => {
    resolveSmsProvider.mockReturnValue('log')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await notifyBookingConfirmed(baseOpts)
    await notifyBookingCancelled(baseOpts)
    await notifyBookingPaid(baseOpts)

    const smsCalls = sendNotification.mock.calls.filter((call) => call[0]?.channel === 'sms')
    expect(smsCalls).toHaveLength(3)
    expect(smsCalls.every((call) => call[0].template.startsWith('BOOKING_'))).toBe(true)
    // In-app + email still run
    expect(createInAppNotification).toHaveBeenCalledTimes(3)
    const emailCalls = sendNotification.mock.calls.filter((call) => call[0]?.channel === 'email')
    expect(emailCalls).toHaveLength(3)

    expect(logSpy).toHaveBeenCalledWith(
      '[bookingNotify:sms]',
      'log',
      'BOOKING_CONFIRMED',
      '09121234567',
      expect.stringContaining('رزرو تایید شد'),
    )
    logSpy.mockRestore()
  })

  it('uses Persian in-app titles/bodies', async () => {
    await notifyBookingConfirmed(baseOpts)
    expect(createInAppNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'BOOKING_CONFIRMED',
      title: 'رزرو تایید شد',
      body: expect.stringContaining('باشگاه تست'),
    }))
    expect(createInAppNotification.mock.calls[0]![0].body).toMatch(/۱۴۰۵|۱۴۰۴/)
    expect(createInAppNotification.mock.calls[0]![0].body).toMatch(/[۰-۹]{1,2}:[۰-۹]{2}/)

    await notifyBookingCancelled(baseOpts)
    expect(createInAppNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'BOOKING_CANCELLED',
      title: 'رزرو لغو شد',
    }))

    await notifyBookingPaid(baseOpts)
    expect(createInAppNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'BOOKING_PAID',
      title: 'پرداخت ثبت شد',
    }))
  })

  it('skips SMS when phone is missing even if live', async () => {
    resolveSmsProvider.mockReturnValue('live')

    await notifyBookingConfirmed({ ...baseOpts, phone: null })

    const smsCalls = sendNotification.mock.calls.filter((call) => call[0]?.channel === 'sms')
    expect(smsCalls).toHaveLength(0)
  })

  it('soft-fails SMS errors without throwing', async () => {
    resolveSmsProvider.mockReturnValue('live')
    sendNotification.mockImplementation(async (opts: { channel: string }) => {
      if (opts.channel === 'sms') throw new Error('gateway down')
      return { sent: true }
    })

    await expect(notifyBookingConfirmed(baseOpts)).resolves.toBeUndefined()
    expect(createInAppNotification).toHaveBeenCalled()
  })

  it('guest-only phone: SMS without userId (skip in-app)', async () => {
    resolveSmsProvider.mockReturnValue('live')
    sendNotification.mockResolvedValue({ sent: true })

    await notifyBookingConfirmed(guestOnlyOpts)
    await notifyBookingCancelled({ ...guestOnlyOpts, reason: 'owner-cancel' })
    await notifyBookingPaid(guestOnlyOpts)

    expect(createInAppNotification).not.toHaveBeenCalled()
    const smsCalls = sendNotification.mock.calls.filter((call) => call[0]?.channel === 'sms')
    expect(smsCalls).toHaveLength(3)
    for (const call of smsCalls) {
      expect(call[0]).toMatchObject({
        channel: 'sms',
        to: '09129876543',
        clubId: 'club-behnaz',
      })
    }
    expect(smsCalls.map((call) => call[0].template)).toEqual([
      'BOOKING_CONFIRMED',
      'BOOKING_CANCELLED',
      'BOOKING_PAID',
    ])
  })

  it('guest-only phone: log mode audits guest number + Persian body', async () => {
    resolveSmsProvider.mockReturnValue('log')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await notifyBookingConfirmed(guestOnlyOpts)

    expect(createInAppNotification).not.toHaveBeenCalled()
    const smsCalls = sendNotification.mock.calls.filter((call) => call[0]?.channel === 'sms')
    expect(smsCalls).toHaveLength(1)
    expect(logSpy).toHaveBeenCalledWith(
      '[bookingNotify:sms]',
      'log',
      'BOOKING_CONFIRMED',
      '09129876543',
      expect.stringContaining('بهناز'),
    )
    logSpy.mockRestore()
  })

  it('passes court, payment, and location on confirmed SMS data', async () => {
    resolveSmsProvider.mockReturnValue('live')
    sendNotification.mockResolvedValue({ sent: true })

    await notifyBookingConfirmed({
      ...guestOnlyOpts,
      courtName: 'زمین ۱',
      paymentPaid: false,
      address: 'سعادت‌آباد',
      mapsUrl: 'https://maps.google.com/?q=35.7,51.4',
      guestName: 'علی رضایی',
    })

    const smsCall = sendNotification.mock.calls.find((call) => call[0]?.channel === 'sms')
    expect(smsCall?.[0].data).toMatchObject({
      courtName: 'زمین ۱',
      paymentPaid: false,
      address: 'سعادت‌آباد',
      mapsUrl: 'https://maps.google.com/?q=35.7,51.4',
      guestName: 'علی رضایی',
    })
  })

  it('includes from-to hours in confirmed SMS when endTime is set', async () => {
    resolveSmsProvider.mockReturnValue('log')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await notifyBookingConfirmed({
      ...guestOnlyOpts,
      startTime: '18:00',
      endTime: '20:00',
    })

    expect(logSpy).toHaveBeenCalledWith(
      '[bookingNotify:sms]',
      'log',
      'BOOKING_CONFIRMED',
      '09129876543',
      expect.stringContaining('از ۱۸:۰۰ تا ۲۰:۰۰'),
    )
    logSpy.mockRestore()
  })

  it('includes guest name, tracking, and receipt URL on desk confirmed SMS data', async () => {
    resolveSmsProvider.mockReturnValue('live')
    sendNotification.mockResolvedValue({ sent: true })

    await notifyBookingConfirmed({
      ...guestOnlyOpts,
      guestName: 'حمید افقه',
      courtName: 'زمین ۳',
      paymentPaid: false,
    })

    const smsCall = sendNotification.mock.calls.find((call) => call[0]?.channel === 'sms')
    expect(smsCall?.[0].data).toMatchObject({
      guestName: 'حمید افقه',
      courtName: 'زمین ۳',
      paymentPaid: false,
    })
    expect(String(smsCall?.[0].data.trackingCode)).toMatch(/^\d{7}$/)
    expect(String(smsCall?.[0].data.receiptUrl)).toContain('/r/')
  })

  it('puts pay pin and pay URL on desk confirmed SMS data', async () => {
    resolveSmsProvider.mockReturnValue('live')
    sendNotification.mockResolvedValue({ sent: true })

    await notifyBookingConfirmed({
      ...guestOnlyOpts,
      guestName: 'حمید افقه',
      paymentPaid: false,
      payPin: 'ab12cd9x',
      payUrl: 'https://inboxs.ir/p/ab12cd9x',
    })

    const smsCall = sendNotification.mock.calls.find((call) => call[0]?.channel === 'sms')
    expect(smsCall?.[0].data).toMatchObject({
      payPin: 'ab12cd9x',
      payUrl: 'https://inboxs.ir/p/ab12cd9x',
      paymentPaid: false,
    })
    expect(sendSms).not.toHaveBeenCalled()
  })

  it('sends a tappable pay-link lookup SMS when the panel template is set', async () => {
    process.env.KAVENEGAR_TEMPLATE_PAY_LINK = 'inbox-pay'
    resolveSmsProvider.mockReturnValue('live')
    sendNotification.mockResolvedValue({ sent: true })
    sendSms.mockResolvedValue({ sent: true })

    await notifyBookingConfirmed({
      ...guestOnlyOpts,
      paymentPaid: false,
      payPin: 'ab12cd9x',
      payUrl: 'https://inboxs.ir/p/ab12cd9x',
    })

    expect(sendSms).toHaveBeenCalledWith(expect.objectContaining({
      to: '09129876543',
      body: 'https://inboxs.ir/p/ab12cd9x',
      lookup: { template: 'inbox-pay', token: 'ab12cd9x' },
    }))
  })

  it('sends owner paid SMS with guest, amount, time, and court', async () => {
    resolveSmsProvider.mockReturnValue('live')
    sendNotification.mockResolvedValue({ sent: true })

    await notifyOwnerBookingPaid({
      ownerPhone: '09121112233',
      clubName: 'بهناز',
      clubId: 'club-1',
      bookingId: 'booking-1',
      date: '2026-08-14',
      startTime: '18:00',
      endTime: '20:00',
      courtName: 'زمین ۲',
      guestName: 'علی رضایی',
      guestPhone: '09121234567',
      amountPaid: 750000,
    })

    const smsCall = sendNotification.mock.calls.find((call) => call[0]?.channel === 'sms')
    expect(smsCall?.[0]).toMatchObject({
      channel: 'sms',
      to: '09121112233',
      template: 'OWNER_BOOKING_PAID',
      clubId: 'club-1',
      data: expect.objectContaining({
        guestName: 'علی رضایی',
        guestPhone: '09121234567',
        amountPaid: 750000,
        courtName: 'زمین ۲',
        startTime: '18:00',
        endTime: '20:00',
      }),
    })
  })

  it('skips owner paid SMS when owner phone is missing', async () => {
    resolveSmsProvider.mockReturnValue('live')
    await notifyOwnerBookingPaid({
      ownerPhone: null,
      clubName: 'بهناز',
      date: '2026-08-14',
      startTime: '18:00',
      amountPaid: 1000,
    })
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('sends owner cancelled SMS with guest and time', async () => {
    resolveSmsProvider.mockReturnValue('live')
    sendNotification.mockResolvedValue({ sent: true })

    await notifyOwnerBookingCancelled({
      ownerPhone: '09121112233',
      clubName: 'بهناز',
      clubId: 'club-1',
      bookingId: 'booking-1',
      date: '2026-08-14',
      startTime: '18:00',
      endTime: '20:00',
      courtName: 'زمین ۲',
      guestName: 'علی رضایی',
      guestPhone: '09121234567',
    })

    const smsCall = sendNotification.mock.calls.find((call) => call[0]?.channel === 'sms')
    expect(smsCall?.[0]).toMatchObject({
      channel: 'sms',
      to: '09121112233',
      template: 'OWNER_BOOKING_CANCELLED',
      clubId: 'club-1',
    })
  })
})
