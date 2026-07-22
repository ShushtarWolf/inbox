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

  it('includes club + date/time in booking and waitlist templates', () => {
    expect(
      renderSmsTemplate('BOOKING_CONFIRMED', {
        clubName: 'بهناز',
        date: '1404/01/01',
        startTime: '10:00',
      }),
    ).toBe('رزرو تایید شد «بهناز» — 1404/01/01 ساعت 10:00')
    expect(
      renderSmsTemplate('BOOKING_CANCELLED', {
        clubName: 'بهناز',
        date: '1404/01/01',
        startTime: '10:00',
      }),
    ).toContain('رزرو لغو شد «بهناز»')
    expect(
      renderSmsTemplate('WAITLIST_SLOT_AVAILABLE', {
        clubName: 'بهناز',
        date: '1404/01/01',
        startTime: '18:00',
      }),
    ).toBe('نوبت آزاد شد «بهناز» — 1404/01/01 ساعت 18:00. سریع رزرو کنید')
  })
})
