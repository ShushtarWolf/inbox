import { describe, expect, it } from 'vitest'
import { renderOtpSms, renderSmsTemplate } from './templates'

describe('SMS templates', () => {
  it('renders OTP with extractable 6-digit token', () => {
    expect(renderOtpSms('123456')).toBe('کد تایید inbox: 123456')
  })

  it('renders booking / reset / club / campaign bodies', () => {
    expect(renderSmsTemplate('BOOKING_CONFIRMED', { date: '1404/01/01', time: '10:00' })).toContain('رزرو تایید شد')
    expect(renderSmsTemplate('PASSWORD_RESET', { resetUrl: 'https://example.com/r' })).toContain('https://example.com/r')
    expect(renderSmsTemplate('CLUB_APPROVED', { clubName: 'Behnaz' })).toContain('Behnaz')
    expect(renderSmsTemplate('CAMPAIGN', { message: 'سلام باشگاه' })).toBe('سلام باشگاه')
  })
})
