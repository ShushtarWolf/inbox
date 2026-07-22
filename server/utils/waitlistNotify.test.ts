import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createInAppNotification = vi.fn()
const sendNotification = vi.fn()
const resolveSmsProvider = vi.fn()
const findMany = vi.fn()
const update = vi.fn()
const findUniqueClub = vi.fn()

vi.mock('./notify', () => ({
  createInAppNotification: (...args: unknown[]) => createInAppNotification(...args),
  sendNotification: (...args: unknown[]) => sendNotification(...args),
}))

vi.mock('#shared/sms.ts', () => ({
  resolveSmsProvider: () => resolveSmsProvider(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    club: { findUnique: (...args: unknown[]) => findUniqueClub(...args) },
    waitlistEntry: {
      findMany: (...args: unknown[]) => findMany(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}))

import { notifyWaitlistForFreedSlot } from './waitlistNotify'

const freed = {
  clubId: 'club-1',
  courtId: 'court-1',
  date: '2026-07-20',
  startTime: '10:00',
  endTime: '11:00',
}

describe('waitlistNotify', () => {
  beforeEach(() => {
    createInAppNotification.mockResolvedValue(undefined)
    sendNotification.mockResolvedValue({ sent: true })
    resolveSmsProvider.mockReturnValue('log')
    findUniqueClub.mockResolvedValue({ nameFa: 'بهناز', nameEn: 'Behnaz' })
    findMany.mockResolvedValue([])
    update.mockResolvedValue({})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('matches this court OR any-court (null), excludes coach-specific rows', async () => {
    await notifyWaitlistForFreedSlot(freed)

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clubId: 'club-1',
          status: 'ACTIVE',
          date: '2026-07-20',
          startTime: '10:00',
          coachId: null,
          OR: [{ courtId: null }, { courtId: 'court-1' }],
        }),
      }),
    )
  })

  it('sends SMS when live and phone present (user or guest)', async () => {
    resolveSmsProvider.mockReturnValue('live')
    findMany.mockResolvedValue([
      {
        id: 'w1',
        userId: 'u1',
        guestMobile: null,
        user: { phone: '09121111111', email: 'a@x.com' },
      },
      {
        id: 'w2',
        userId: null,
        guestMobile: '09122222222',
        user: null,
      },
    ])

    await notifyWaitlistForFreedSlot(freed)

    const smsCalls = sendNotification.mock.calls.filter((c) => c[0]?.channel === 'sms')
    expect(smsCalls).toHaveLength(2)
    expect(smsCalls[0][0]).toMatchObject({
      template: 'WAITLIST_SLOT_AVAILABLE',
      to: '09121111111',
      data: expect.objectContaining({ clubName: 'بهناز', startTime: '10:00' }),
    })
    expect(smsCalls[1][0]).toMatchObject({ to: '09122222222' })
    expect(update).toHaveBeenCalledTimes(2)
  })

  it('skips SMS in log mode but still soft-notifies (in-app / skip log)', async () => {
    resolveSmsProvider.mockReturnValue('log')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    findMany.mockResolvedValue([
      {
        id: 'w1',
        userId: 'u1',
        guestMobile: null,
        user: { phone: '09121111111', email: null },
      },
    ])

    await notifyWaitlistForFreedSlot(freed)

    expect(sendNotification.mock.calls.filter((c) => c[0]?.channel === 'sms')).toHaveLength(0)
    expect(createInAppNotification).toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(
      '[waitlistNotify:sms:skip]',
      'WAITLIST_SLOT_AVAILABLE',
      '09121111111',
    )
    expect(update).toHaveBeenCalled()
    logSpy.mockRestore()
  })

  it('never throws when in-app or SMS fails (cancel soft-fail)', async () => {
    resolveSmsProvider.mockReturnValue('live')
    createInAppNotification.mockRejectedValue(new Error('db down'))
    sendNotification.mockImplementation(async (opts: { channel: string }) => {
      if (opts.channel === 'sms') throw new Error('gateway down')
      return { sent: true }
    })
    findMany.mockResolvedValue([
      {
        id: 'w1',
        userId: 'u1',
        guestMobile: null,
        user: { phone: '09121111111', email: 'a@x.com' },
      },
    ])

    await expect(notifyWaitlistForFreedSlot(freed)).resolves.toBeUndefined()
  })

  it('never throws when prisma query fails', async () => {
    findMany.mockRejectedValue(new Error('db query failed'))
    await expect(notifyWaitlistForFreedSlot(freed)).resolves.toBeUndefined()
  })
})
