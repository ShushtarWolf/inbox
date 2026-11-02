import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sendNotification = vi.fn()
const resolveSmsProvider = vi.fn()

vi.mock('./notify', () => ({
  sendNotification: (...args: unknown[]) => sendNotification(...args),
}))

vi.mock('#shared/sms.ts', () => ({
  resolveSmsProvider: () => resolveSmsProvider(),
}))

import {
  adminAlertPhone,
  notifyAdminClubApplication,
  notifyAdminSms,
  notifyAdminWithdrawRequest,
  withdrawFinanceAlertPhones,
} from './adminNotify'

describe('adminNotify', () => {
  beforeEach(() => {
    sendNotification.mockResolvedValue({ sent: true })
    resolveSmsProvider.mockReturnValue('live')
    delete process.env.ADMIN_ALERT_SMS
    delete process.env.ADMIN_ALERT_PHONE
    delete process.env.NUXT_PUBLIC_CONTACT_MOBILE
    delete process.env.WITHDRAW_FINANCE_ALERT_PHONE
    delete process.env.FINANCE_ALERT_PHONE
  })

  afterEach(() => {
    vi.clearAllMocks()
    delete process.env.ADMIN_ALERT_SMS
    delete process.env.ADMIN_ALERT_PHONE
    delete process.env.NUXT_PUBLIC_CONTACT_MOBILE
    delete process.env.WITHDRAW_FINANCE_ALERT_PHONE
    delete process.env.FINANCE_ALERT_PHONE
  })

  it('defaults admin phone to 09124777927', () => {
    expect(adminAlertPhone()).toBe('09124777927')
  })

  it('respects ADMIN_ALERT_PHONE override', () => {
    process.env.ADMIN_ALERT_PHONE = '09121112233'
    expect(adminAlertPhone()).toBe('09121112233')
  })

  it('disables when ADMIN_ALERT_SMS=false', () => {
    process.env.ADMIN_ALERT_SMS = 'false'
    expect(adminAlertPhone()).toBeNull()
  })

  it('sends admin SMS soft-fail', async () => {
    await notifyAdminSms('ADMIN_CLUB_APPLICATION', { clubName: 'تست' })
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'sms',
        to: '09124777927',
        template: 'ADMIN_CLUB_APPLICATION',
      }),
    )
  })

  it('skips send when disabled', async () => {
    process.env.ADMIN_ALERT_SMS = 'false'
    await notifyAdminClubApplication({ clubName: 'تست', city: 'تهران' })
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('sends withdraw request alert to finance phones', async () => {
    process.env.WITHDRAW_FINANCE_ALERT_PHONE = '09123334455'
    expect(withdrawFinanceAlertPhones()).toEqual(['09123334455'])
    await notifyAdminWithdrawRequest({
      kind: 'coach',
      amount: 250000,
      sheba: 'IR00',
      userName: 'بهناز تعبدی',
      userPhone: '09122900854',
      requestId: 'w1',
    })
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '09123334455',
        template: 'ADMIN_WITHDRAW_REQUEST',
        data: expect.objectContaining({ kind: 'coach', amount: 250000 }),
      }),
    )
  })
})
