import type { NotifyTemplate } from '../notify'
import { formatSmsJalaliDate, formatSmsTime } from '#shared/jalali.ts'

function clubBit(data: Record<string, unknown>) {
  const name = String(data.clubName || '').trim()
  return name ? ` «${name}»` : ''
}

function whenBit(data: Record<string, unknown>) {
  const dateRaw = String(data.date || '').trim()
  const startRaw = String(data.time || data.startTime || '').trim()
  const endRaw = String(data.endTime || '').trim()
  const date = dateRaw ? formatSmsJalaliDate(dateRaw) : ''
  const start = startRaw ? formatSmsTime(startRaw) : ''
  const end = endRaw ? formatSmsTime(endRaw) : ''
  if (date && start && end && end !== start) return `${date} از ${start} تا ${end}`
  if (date && start) return `${date} ساعت ${start}`
  if (start && end && end !== start) return `از ${start} تا ${end}`
  return date || start || ''
}

function paidBit(data: Record<string, unknown>) {
  if (typeof data.paymentPaid === 'boolean') {
    return data.paymentPaid ? 'پرداخت شده' : 'پرداخت نشده'
  }
  const status = String(data.paymentStatus || '').toUpperCase()
  if (status === 'PAID') return 'پرداخت شده'
  if (status) return 'پرداخت نشده'
  return ''
}

function bookingDetailLines(data: Record<string, unknown>) {
  const court = String(data.courtName || '').trim()
  const paid = paidBit(data)
  const address = String(data.address || '').trim()
  const maps = String(data.mapsUrl || '').trim()
  const lines: string[] = []
  if (court) lines.push(`زمین: ${court}`)
  if (paid) lines.push(`وضعیت پرداخت: ${paid}`)
  if (address) lines.push(address)
  if (maps) lines.push(maps)
  return lines
}

/**
 * Short Persian free-text bodies for Kavenegar sms/send (needs KAVENEGAR_SENDER when live).
 * OTP uses Verify Lookup separately — do not route these through KAVENEGAR_TEMPLATE.
 */
const TEMPLATE_BODIES: Record<NotifyTemplate | 'CAMPAIGN', (data: Record<string, unknown>) => string> = {
  PASSWORD_RESET: (data) => `بازیابی رمز inbox: ${data.resetUrl || ''}`,
  BOOKING_CONFIRMED: (data) => {
    const when = whenBit(data)
    const head = when
      ? `رزرو تایید شد${clubBit(data)} — ${when}`
      : `رزرو تایید شد${clubBit(data)}`
    const extra = bookingDetailLines(data)
    return [head, ...extra, 'اینباکس'].join('\n')
  },
  BOOKING_CANCELLED: (data) => {
    const when = whenBit(data)
    return when
      ? `رزرو لغو شد${clubBit(data)} — ${when}. اینباکس`
      : `رزرو لغو شد${clubBit(data)}. اینباکس`
  },
  BOOKING_PAID: (data) => {
    const when = whenBit(data)
    return when
      ? `پرداخت رزرو ثبت شد${clubBit(data)} — ${when}. اینباکس`
      : `پرداخت رزرو ثبت شد${clubBit(data)}. اینباکس`
  },
  CLUB_APPROVED: (data) => `باشگاه «${data.clubName || ''}» در inbox تایید شد`,
  WAITLIST_SLOT_AVAILABLE: (data) => {
    const when = whenBit(data)
    return when
      ? `نوبت آزاد شد${clubBit(data)} — ${when}. سریع رزرو کنید`
      : `نوبت آزاد شد${clubBit(data)}. سریع رزرو کنید`
  },
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
