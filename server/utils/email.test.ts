import { afterEach, describe, expect, it, vi } from 'vitest'

const sendMail = vi.fn()

vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({ sendMail }),
  },
}))

describe('email utils', () => {
  afterEach(() => {
    vi.resetModules()
    sendMail.mockReset()
    delete process.env.EMAIL_ENABLED
    delete process.env.SMTP_HOST
    delete process.env.SMTP_PORT
    delete process.env.SMTP_USER
    delete process.env.SMTP_PASS
    delete process.env.SMTP_FROM
  })

  it('defaults to log mode when EMAIL_ENABLED unset', async () => {
    const { getEmailMode, isEmailConfigured, isEmailEnabled, sendEmail } = await import('./email')
    expect(isEmailEnabled()).toBe(false)
    expect(isEmailConfigured()).toBe(false)
    expect(getEmailMode()).toBe('log')
    const result = await sendEmail({
      to: 'a@example.com',
      subject: 'Test',
      text: 'hi',
      html: '<p>hi</p>',
    })
    expect(result).toEqual({ sent: false, reason: 'disabled' })
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('stays log when EMAIL_ENABLED=true but SMTP_HOST missing', async () => {
    process.env.EMAIL_ENABLED = 'true'
    const { getEmailMode, isEmailConfigured, sendEmail, getEmailStatus } = await import('./email')
    expect(isEmailConfigured()).toBe(false)
    expect(getEmailMode()).toBe('log')
    const status = getEmailStatus()
    expect(status.emailConfigured).toBe(false)
    expect(status.warnings.length).toBeGreaterThan(0)
    expect(JSON.stringify(status)).not.toMatch(/SMTP_PASS|password/i)
    const result = await sendEmail({
      to: 'a@example.com',
      subject: 'Test',
      text: 'hi',
      html: '<p>hi</p>',
    })
    expect(result.sent).toBe(false)
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('sends live when EMAIL_ENABLED + SMTP_HOST set', async () => {
    process.env.EMAIL_ENABLED = 'true'
    process.env.SMTP_HOST = 'smtp.example.com'
    process.env.SMTP_FROM = 'inbox <noreply@example.com>'
    sendMail.mockResolvedValue({ messageId: '1' })
    const { getEmailMode, isEmailConfigured, sendEmail } = await import('./email')
    expect(isEmailConfigured()).toBe(true)
    expect(getEmailMode()).toBe('live')
    const result = await sendEmail({
      to: 'a@example.com',
      subject: 'Test',
      text: 'hi',
      html: '<p>hi</p>',
    })
    expect(result).toEqual({ sent: true })
    expect(sendMail).toHaveBeenCalledOnce()
  })

  it('fail-soft on SMTP send errors', async () => {
    process.env.EMAIL_ENABLED = 'true'
    process.env.SMTP_HOST = 'smtp.example.com'
    sendMail.mockRejectedValue(new Error('SMTP down'))
    const { sendEmail } = await import('./email')
    const result = await sendEmail({
      to: 'a@example.com',
      subject: 'Test',
      text: 'hi',
      html: '<p>hi</p>',
    })
    expect(result).toEqual({ sent: false, reason: 'send_error' })
  })

  it('getEmailStatus never includes SMTP_PASS even when set', async () => {
    process.env.EMAIL_ENABLED = 'true'
    process.env.SMTP_HOST = 'smtp.example.com'
    process.env.SMTP_USER = 'user'
    process.env.SMTP_PASS = 'super-secret-pass'
    process.env.SMTP_FROM = 'inbox <noreply@example.com>'
    const { getEmailStatus } = await import('./email')
    const status = getEmailStatus()
    const json = JSON.stringify(status)
    expect(json).not.toContain('super-secret-pass')
    expect(json).not.toMatch(/SMTP_PASS/)
    expect(status).not.toHaveProperty('SMTP_PASS')
    expect(status).not.toHaveProperty('pass')
    expect(status.emailMode).toBe('live')
    expect(status.hasSmtpUser).toBe(true)
  })
})
