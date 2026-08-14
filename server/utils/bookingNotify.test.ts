import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createInAppNotification = vi.fn()
const sendNotification = vi.fn()
const resolveSmsProvider = vi.fn()

vi.mock('./notify', () => ({
  createInAppNotification: (...args: unknown[]) => createInAppNotification(...args),
  sendNotification: (...args: unknown[]) => sendNotification(...args),
}))

vi.mock('#shared/sms.ts', () => ({
  resolveSmsProvider: () => resolveSmsProvider(),
}))

import {
  clubNotifyLocation,
  clubNotifyName,
  notifyBookingCancelled,
  notifyBookingConfirmed,
  notifyBookingPaid,
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
    createInAppNotification.mockResolvedValue(undefined)
    sendNotification.mockResolvedValue({ sent: false, logged: true })
    resolveSmsProvider.mockReturnValue('log')
  })

  afterEach(() => {
    vi.clearAllMocks()
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
    })

    const smsCall = sendNotification.mock.calls.find((call) => call[0]?.channel === 'sms')
    expect(smsCall?.[0].data).toMatchObject({
      courtName: 'زمین ۱',
      paymentPaid: false,
      address: 'سعادت‌آباد',
      mapsUrl: 'https://maps.google.com/?q=35.7,51.4',
    })
  })
})
