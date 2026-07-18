import { afterEach, describe, expect, it, vi } from 'vitest'

const sendEmail = vi.fn()
const renderEmailTemplate = vi.fn(() => ({
  subject: 'Subj',
  text: 'text',
  html: '<p>html</p>',
}))

vi.mock('./email', async () => {
  const actual = await vi.importActual<typeof import('./email')>('./email')
  return {
    ...actual,
    sendEmail: (...args: unknown[]) => sendEmail(...args),
  }
})

vi.mock('./emailTemplates', () => ({
  renderEmailTemplate: (...args: unknown[]) => renderEmailTemplate(...args),
}))

vi.mock('./sms/templates', () => ({
  renderSmsTemplate: () => 'sms body',
}))

vi.mock('./sms/service', () => ({
  sendSms: vi.fn(),
}))

vi.mock('#shared/sms.ts', () => ({
  isSmsEnabled: () => false,
}))

describe('sendNotification email', () => {
  afterEach(() => {
    vi.resetModules()
    sendEmail.mockReset()
    renderEmailTemplate.mockClear()
    delete process.env.EMAIL_ENABLED
    delete process.env.SMTP_HOST
  })

  it('logs and skips SMTP when EMAIL_ENABLED unset', async () => {
    const { sendNotification } = await import('./notify')
    const result = await sendNotification({
      channel: 'email',
      to: 'a@example.com',
      template: 'PASSWORD_RESET',
      data: { resetUrl: 'http://localhost/reset' },
    })
    expect(result).toEqual({ sent: false, logged: true })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('logs when enabled without SMTP host', async () => {
    process.env.EMAIL_ENABLED = 'true'
    const { sendNotification } = await import('./notify')
    const result = await sendNotification({
      channel: 'email',
      to: 'a@example.com',
      template: 'BOOKING_CONFIRMED',
      data: { clubName: 'Club', date: '2026-07-18', startTime: '10:00', kind: 'court' },
    })
    expect(result).toEqual({ sent: false, logged: true })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('calls sendEmail when live-configured and never throws on send failure', async () => {
    process.env.EMAIL_ENABLED = 'true'
    process.env.SMTP_HOST = 'smtp.example.com'
    sendEmail.mockResolvedValue({ sent: false, reason: 'send_error' })
    const { sendNotification } = await import('./notify')
    await expect(
      sendNotification({
        channel: 'email',
        to: 'a@example.com',
        template: 'BOOKING_PAID',
        data: { clubName: 'Club', date: '2026-07-18', startTime: '10:00', kind: 'court' },
      }),
    ).resolves.toEqual({ sent: false, logged: true })
    expect(sendEmail).toHaveBeenCalledOnce()
  })
})
