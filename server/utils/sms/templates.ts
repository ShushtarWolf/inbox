import type { NotifyTemplate } from '../notify'
import { formatSmsJalaliDate, formatSmsTime, toPersianDigits } from '#shared/jalali.ts'

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

/** Product amounts are toman — same integer as Payment.amount (IPG converts to rials). */
function amountBit(data: Record<string, unknown>) {
  const raw = data.amountPaid ?? data.amount
  if (raw == null || raw === '') return ''
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return ''
  return `${new Intl.NumberFormat('fa-IR').format(n)} تومان`
}

function bookingDetailLines(data: Record<string, unknown>) {
  const court = String(data.courtName || '').trim()
  const paid = paidBit(data)
  const address = String(data.address || '').trim()
  const maps = String(data.mapsUrl || '').trim()
  const tracking = String(data.trackingCode || '').trim()
  const receiptUrl = String(data.receiptUrl || '').trim()
  const lines: string[] = []
  if (court) lines.push(`زمین: ${court}`)
  if (paid) lines.push(`وضعیت پرداخت: ${paid}`)
  if (address) lines.push(address)
  if (maps) lines.push(maps)
  if (tracking) lines.push(`کد رهگیری: ${toPersianDigits(tracking)}`)
  if (receiptUrl) {
    if (data.paymentPaid !== true) lines.push('لینک پرداخت:')
    lines.push(receiptUrl)
  }
  return lines
}

/**
 * Short Persian free-text bodies for Kavenegar sms/send (needs KAVENEGAR_SENDER when live).
 * OTP uses Verify Lookup separately — do not route these through KAVENEGAR_TEMPLATE.
 */
const TEMPLATE_BODIES: Record<NotifyTemplate | 'CAMPAIGN', (data: Record<string, unknown>) => string> = {
  PASSWORD_RESET: (data) => `بازیابی رمز inbox: ${data.resetUrl || ''}`,
  BOOKING_CONFIRMED: (data) => {
    const guest = String(data.guestName || data.userName || '').trim()
    if (guest) {
      const club = String(data.clubName || '').trim()
      const dateRaw = String(data.date || '').trim()
      const startRaw = String(data.time || data.startTime || '').trim()
      const date = dateRaw ? formatSmsJalaliDate(dateRaw) : ''
      const start = startRaw ? formatSmsTime(startRaw) : ''
      const court = String(data.courtName || '').trim()
      const courtBit = court ? ` (${court})` : ''
      const tracking = String(data.trackingCode || '').trim()
      const receiptUrl = String(data.receiptUrl || '').trim()
      const paid = data.paymentPaid === true
      const whenLine = date && start
        ? `برای تاریخ ${date} ساعت ${start}${courtBit} با موفقیت انجام شد.`
        : 'با موفقیت انجام شد.'
      const lines = [
        `${guest} عزیز`,
        club ? `رزرو شما در ${club}` : 'رزرو شما',
        whenLine,
      ]
      if (tracking) lines.push(`کد رهگیری: ${toPersianDigits(tracking)}`)
      if (!paid && receiptUrl) {
        lines.push('لینک پرداخت:')
        lines.push(receiptUrl)
      } else if (receiptUrl) {
        lines.push(receiptUrl)
      }
      return lines.join('\n')
    }
    const when = whenBit(data)
    const head = when
      ? `رزرو تایید شد${clubBit(data)} — ${when}`
      : `رزرو تایید شد${clubBit(data)}`
    const extra = bookingDetailLines(data)
    return [head, ...extra, 'اینباکس'].filter(Boolean).join('\n')
  },
  BOOKING_CANCELLED: (data) => {
    const guest = String(data.guestName || data.userName || '').trim()
    const tracking = String(data.trackingCode || '').trim()
    const court = String(data.courtName || '').trim()
    const when = whenBit(data)
    // Keep short for Kavenegar token10 (inbox-notify lookup).
    const bits = [
      guest ? `رزرو ${guest} لغو شد` : `رزرو لغو شد${clubBit(data)}`,
      court,
      when,
      tracking ? `کد ${toPersianDigits(tracking)}` : '',
      'اینباکس',
    ].filter(Boolean)
    return bits.join(' | ')
  },
  BOOKING_PAID: (data) => {
    const when = whenBit(data)
    return when
      ? `پرداخت رزرو ثبت شد${clubBit(data)} — ${when}. اینباکس`
      : `پرداخت رزرو ثبت شد${clubBit(data)}. اینباکس`
  },
  /** Compact single-line — service-line lookup uses token10 (~100 chars). */
  OWNER_BOOKING_PAID: (data) => {
    const guest = String(data.guestName || data.userName || '').trim() || 'مهمان'
    const guestPhone = String(data.guestPhone || '').trim()
    const amount = amountBit(data)
    const when = whenBit(data)
    const court = String(data.courtName || '').trim()
    const bits = [
      'پرداخت رزرو',
      guestPhone ? `${guest} (${toPersianDigits(guestPhone)})` : guest,
      amount,
      when,
      court,
      'اینباکس',
    ].filter(Boolean)
    return bits.join(' | ')
  },
  OWNER_BOOKING_CANCELLED: (data) => {
    const guest = String(data.guestName || data.userName || '').trim() || 'مهمان'
    const guestPhone = String(data.guestPhone || '').trim()
    const when = whenBit(data)
    const court = String(data.courtName || '').trim()
    const bits = [
      'لغو رزرو',
      guestPhone ? `${guest} (${toPersianDigits(guestPhone)})` : guest,
      when,
      court,
      'اینباکس',
    ].filter(Boolean)
    return bits.join(' | ')
  },
  /** Daily club-owner digest — multi-line; live path may chunk for token10. */
  OWNER_DAILY_RESERVATIONS: (data) => {
    const club = String(data.clubName || '').trim() || 'باشگاه'
    const dateRaw = String(data.date || '').trim()
    const date = dateRaw ? formatSmsJalaliDate(dateRaw) : ''
    const rawLines = Array.isArray(data.lines) ? data.lines : []
    const lines = rawLines.map((row) => {
      if (typeof row === 'string') return row.trim()
      if (!row || typeof row !== 'object') return ''
      const item = row as Record<string, unknown>
      const court = String(item.court || item.courtName || '').trim()
      const startRaw = String(item.start || item.startTime || '').trim()
      const endRaw = String(item.end || item.endTime || '').trim()
      const start = startRaw ? formatSmsTime(startRaw) : ''
      const end = endRaw ? formatSmsTime(endRaw) : ''
      const guest = String(item.guest || item.guestLabel || '').trim()
      const when = start && end && end !== start ? `${start}–${end}` : start
      return ['•', court, when ? `| ${when}` : '', guest ? `| ${guest}` : ''].filter(Boolean).join(' ')
    }).filter(Boolean)
    const countRaw = data.count ?? lines.length
    const count = typeof countRaw === 'number' ? countRaw : Number(countRaw)
    const countLabel = Number.isFinite(count)
      ? toPersianDigits(String(count))
      : toPersianDigits(String(lines.length))
    return [
      `یادآوری رزرو — باشگاه ${club}`,
      date ? `تاریخ: ${date}` : '',
      '',
      ...lines,
      '',
      `جمع: ${countLabel} رزرو`,
      'اینباکس',
    ].filter((line, index, arr) => {
      if (line !== '') return true
      // Keep intentional blank separators; drop leading/trailing/duplicate blanks.
      const prev = arr[index - 1]
      const next = arr[index + 1]
      return Boolean(prev && next && prev !== '' && next !== '')
    }).join('\n')
  },
  CLUB_APPROVED: (data) => `باشگاه «${data.clubName || ''}» در inbox تایید شد`,
  WAITLIST_SLOT_AVAILABLE: (data) => {
    const when = whenBit(data)
    return when
      ? `نوبت آزاد شد${clubBit(data)} — ${when}. سریع رزرو کنید`
      : `نوبت آزاد شد${clubBit(data)}. سریع رزرو کنید`
  },
  /** Compact admin alerts — Verify Lookup token10 (~100 chars). */
  ADMIN_BOOKING_CONFIRMED: (data) => {
    const guest = String(data.guestName || data.userName || '').trim() || 'مهمان'
    const guestPhone = String(data.guestPhone || data.phone || '').trim()
    const when = whenBit(data)
    const court = String(data.courtName || '').trim()
    const tracking = String(data.trackingCode || '').trim()
    return [
      'رزرو جدید',
      clubBit(data).trim() || '',
      guestPhone ? `${guest} (${toPersianDigits(guestPhone)})` : guest,
      when,
      court,
      tracking ? `کد ${toPersianDigits(tracking)}` : '',
      'اینباکس',
    ].filter(Boolean).join(' | ')
  },
  ADMIN_BOOKING_PAID: (data) => {
    const guest = String(data.guestName || data.userName || '').trim() || 'مهمان'
    const guestPhone = String(data.guestPhone || data.phone || '').trim()
    const amount = amountBit(data)
    const when = whenBit(data)
    const court = String(data.courtName || '').trim()
    return [
      'پرداخت رزرو',
      clubBit(data).trim() || '',
      guestPhone ? `${guest} (${toPersianDigits(guestPhone)})` : guest,
      amount,
      when,
      court,
      'اینباکس',
    ].filter(Boolean).join(' | ')
  },
  ADMIN_BOOKING_CANCELLED: (data) => {
    const guest = String(data.guestName || data.userName || '').trim() || 'مهمان'
    const guestPhone = String(data.guestPhone || data.phone || '').trim()
    const when = whenBit(data)
    const court = String(data.courtName || '').trim()
    const tracking = String(data.trackingCode || '').trim()
    return [
      'لغو رزرو',
      clubBit(data).trim() || '',
      guestPhone ? `${guest} (${toPersianDigits(guestPhone)})` : guest,
      when,
      court,
      tracking ? `کد ${toPersianDigits(tracking)}` : '',
      'اینباکس',
    ].filter(Boolean).join(' | ')
  },
  ADMIN_WITHDRAW_REQUEST: (data) => {
    const kind = String(data.kind || '').toLowerCase() === 'athlete' ? 'ورزشکار' : 'باشگاه'
    const who = kind === 'ورزشکار'
      ? (String(data.userName || data.userPhone || '').trim() || 'ورزشکار')
      : (String(data.clubName || '').trim() || 'باشگاه')
    const amount = amountBit(data)
    const sheba = String(data.sheba || '').trim()
    return [
      `برداشت ${kind}`,
      who,
      amount,
      sheba ? `شبا ${toPersianDigits(sheba.slice(-4))}` : '',
      'اقدام در ادمین',
      'اینباکس',
    ].filter(Boolean).join(' | ')
  },
  ADMIN_CLUB_APPLICATION: (data) => {
    const club = String(data.clubName || '').trim() || 'باشگاه'
    const city = String(data.city || '').trim()
    const contact = String(data.contactName || '').trim()
    const phone = String(data.contactPhone || '').trim()
    return [
      'درخواست باشگاه',
      club,
      city,
      contact,
      phone ? toPersianDigits(phone) : '',
      'اقدام در ادمین',
      'اینباکس',
    ].filter(Boolean).join(' | ')
  },
  ADMIN_WALLET_TOPUP: (data) => {
    const who = String(data.userName || data.userPhone || '').trim() || 'کاربر'
    const phone = String(data.userPhone || '').trim()
    const amount = amountBit(data)
    return [
      'شارژ کیف پول',
      phone ? `${who} (${toPersianDigits(phone)})` : who,
      amount,
      'اینباکس',
    ].filter(Boolean).join(' | ')
  },
  CAMPAIGN: (data) => String(data.message || ''),
}

/** OTP body — Kavenegar Verify Lookup extracts the 6-digit token when KAVENEGAR_TEMPLATE is used. */
export function renderOtpSms(code: string) {
  return `کد تایید inbox: ${code}`
}

export function renderSmsTemplate(template: NotifyTemplate | 'CAMPAIGN', data: Record<string, unknown>) {
  const render = TEMPLATE_BODIES[template]
  return render ? render(data) : String(data.message || '')
}
