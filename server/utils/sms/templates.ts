import type { NotifyTemplate } from '../notify'

function clubBit(data: Record<string, unknown>) {
  const name = String(data.clubName || '').trim()
  return name ? ` «${name}»` : ''
}

function whenBit(data: Record<string, unknown>) {
  const date = String(data.date || '').trim()
  const time = String(data.time || data.startTime || '').trim()
  if (date && time) return `${date} ساعت ${time}`
  return date || time || ''
}

const TEMPLATE_BODIES: Record<NotifyTemplate | 'CAMPAIGN', (data: Record<string, unknown>) => string> = {
  PASSWORD_RESET: (data) => `بازیابی رمز inbox: ${data.resetUrl || ''}`,
  BOOKING_CONFIRMED: (data) => `رزرو تایید شد${clubBit(data)} — ${whenBit(data)}`,
  BOOKING_CANCELLED: (data) => `رزرو لغو شد${clubBit(data)} — ${whenBit(data)}`,
  BOOKING_PAID: (data) => `پرداخت نقدی ثبت شد${clubBit(data)} — ${whenBit(data)}`,
  CLUB_APPROVED: (data) => `باشگاه «${data.clubName || ''}» در inbox تایید شد`,
  WAITLIST_SLOT_AVAILABLE: (data) => `نوبت آزاد شد${clubBit(data)} — ${whenBit(data)}. سریع رزرو کنید`,
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
