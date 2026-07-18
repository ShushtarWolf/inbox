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
  notifyBookingCancelled,
  notifyBookingConfirmed,
  notifyBookingPaid,
} from './bookingNotify'

const baseOpts = {
  userId: 'user-1',
  email: 'athlete@inbox.local',
  phone: '09121234567',
  clubName: 'Test Club',
  date: '2026-07-20',
  startTime: '10:00',
  kind: 'court' as const,
  bookingId: 'booking-1',
  clubId: 'club-1',
}

describe('bookingNotify SMS', () => {
  beforeEach(() => {
    createInAppNotification.mockResolvedValue(undefined)
    sendNotification.mockResolvedValue({ sent: true })
    resolveSmsProvider.mockReturnValue('log')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('attempts SMS when provider is live and phone is present', async () => {
    resolveSmsProvider.mockReturnValue('live')

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

  it('skips SMS when provider is log (no fake sent)', async () => {
    resolveSmsProvider.mockReturnValue('log')

    await notifyBookingConfirmed(baseOpts)
    await notifyBookingCancelled(baseOpts)
    await notifyBookingPaid(baseOpts)

    const smsCalls = sendNotification.mock.calls.filter((call) => call[0]?.channel === 'sms')
    expect(smsCalls).toHaveLength(0)
    // In-app + email still run
    expect(createInAppNotification).toHaveBeenCalledTimes(3)
    const emailCalls = sendNotification.mock.calls.filter((call) => call[0]?.channel === 'email')
    expect(emailCalls).toHaveLength(3)
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
})
