import type { NotifyTemplate } from '../notify'

const TEMPLATE_BODIES: Record<NotifyTemplate | 'CAMPAIGN', (data: Record<string, unknown>) => string> = {
  PASSWORD_RESET: (data) => `بازیابی رمز inbox: ${data.resetUrl || ''}`,
  BOOKING_CONFIRMED: (data) => `رزرو تایید شد — ${data.date || ''} ساعت ${data.time || data.startTime || ''}`,
  BOOKING_CANCELLED: (data) => `رزرو لغو شد — ${data.date || ''} ساعت ${data.time || data.startTime || ''}`,
  BOOKING_PAID: (data) => `پرداخت نقدی در باشگاه ثبت شد — ${data.date || ''} ساعت ${data.time || data.startTime || ''}`,
  CLUB_APPROVED: (data) => `باشگاه «${data.clubName || ''}» در inbox تایید شد`,
  WAITLIST_SLOT_AVAILABLE: (data) => `نوبت آزاد شد: ${data.date || ''} ${data.time || ''}`,
  CAMPAIGN: (data) => String(data.message || ''),
}

/** OTP body — Kavenegar Verify Lookup extracts the 6-digit token when KAVENEGAR_TEMPLATE is set. */
export function renderOtpSms(code: string) {
  return `کد تایید inbox: ${code}`
}

export function renderSmsTemplate(template: NotifyTemplate | 'CAMPAIGN', data: Record<string, unknown>) {
  const render = TEMPLATE_BODIES[template]
  return render ? render(data) : String(data.message || '')
}
