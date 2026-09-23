import type { NotifyTemplate } from '../notify'
import { formatSmsJalaliDate, formatSmsTime, toPersianDigits } from '#shared/jalali.ts'

/** Owner reservations page. Prod: https://inboxs.ir/owner/calendar */
export function ownerDailyReservationsCalendarUrl(data?: Record<string, unknown>) {
  const explicit = String(data?.calendarUrl || '').trim()
  if (explicit) return explicit
  const base = (process.env.NUXT_PUBLIC_SITE_URL || 'https://inboxs.ir').replace(/\/$/, '')
  return `${base}/owner/calendar`
}

/** Athlete bookings dashboard. Prod: https://inboxs.ir/athlete/bookings */
export function athleteBookingsDashboardUrl(data?: Record<string, unknown>) {
  const explicit = String(data?.dashboardUrl || '').trim()
  if (explicit) return explicit
  const base = (process.env.NUXT_PUBLIC_SITE_URL || 'https://inboxs.ir').replace(/\/$/, '')
  return `${base}/athlete/bookings`
}

function clubBit(data: Record<string, unknown>) {
  const name = String(data.clubName || '').trim()
  return name ? ` «${name}»` : ''
}

type SmsSessionRow = {
  courtName?: string
  date?: string
  startTime?: string
  endTime?: string
  time?: string
}

function formatGuestSessionLine(row: SmsSessionRow) {
  const court = String(row.courtName || '').trim()
  const dateRaw = String(row.date || '').trim()
  const startRaw = String(row.startTime || row.time || '').trim()
  const endRaw = String(row.endTime || '').trim()
  const date = dateRaw ? formatSmsJalaliDate(dateRaw) : ''
  const start = startRaw ? formatSmsTime(startRaw) : ''
  const end = endRaw ? formatSmsTime(endRaw) : ''
  const when = start && end && end !== start
    ? `${start} تا ${end}`
    : start || end
  return [court, date, when].filter(Boolean).join(' | ')
}

/** Guest confirmation session lines — explicit `sessions` or a single fallback row. */
function guestSessionLines(data: Record<string, unknown>): string[] {
  const lines: string[] = []
  const raw = data.sessions
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row || typeof row !== 'object') continue
      const line = formatGuestSessionLine(row as SmsSessionRow)
      if (line) lines.push(line)
    }
  }
  if (lines.length) return lines
  const fallback = formatGuestSessionLine({
    courtName: String(data.courtName || data.courtNumber || '').trim(),
    date: String(data.date || data.startDate || '').trim(),
    startTime: String(data.time || data.startTime || '').trim(),
    endTime: String(data.endTime || '').trim(),
  })
  return fallback ? [fallback] : []
}

/**
 * Guest «رزرو تایید شد» body — multi-session list + order code + dashboard link.
 * Used for court / coach / package / season when a guest name is present.
 */
function renderGuestBookingConfirmed(data: Record<string, unknown>) {
  const guest = String(data.guestName || data.userName || '').trim()
  if (!guest) return ''
  const club = String(data.clubName || '').trim()
  const tracking = String(data.trackingCode || data.orderCode || '').trim()
  const detailUrl = String(data.dashboardUrl || '').trim() || athleteBookingsDashboardUrl(data)
  const sessionLines = guestSessionLines(data)

  const blocks: string[] = [
    `${guest} عزیز`,
    'رزرو شما با موفقیت ثبت شد.',
  ]
  if (club) {
    blocks.push('', `باشگاه: «${club}»`)
  }
  blocks.push('', 'مشخصات رزرو:')
  if (sessionLines.length) blocks.push(...sessionLines)
  if (tracking) {
    blocks.push('', `کد سفارش: ${toPersianDigits(tracking)}`)
  }
  blocks.push(
    '',
    'مشاهده جزئیات رزرو، قوانین، حساب‌وکتاب و لوکیشن:',
    detailUrl,
    'Inboxs',
  )
  return blocks.join('\n')
}

function whenBit(data: Record<string, unknown>) {
  const dateRaw = String(data.date || '').trim()
  const finishRaw = String(data.finishDate || '').trim()
  const startRaw = String(data.time || data.startTime || '').trim()
  const endRaw = String(data.endTime || '').trim()
  const date = dateRaw ? formatSmsJalaliDate(dateRaw) : ''
  const finish = finishRaw ? formatSmsJalaliDate(finishRaw) : ''
  const start = startRaw ? formatSmsTime(startRaw) : ''
  const end = endRaw ? formatSmsTime(endRaw) : ''
  const rawCount = data.sessionCount
  const count = typeof rawCount === 'number' && rawCount > 1
    ? rawCount
    : (typeof rawCount === 'string' && Number(rawCount) > 1 ? Number(rawCount) : 0)
  if (count && date && finish && finish !== date) {
    const sessions = `${toPersianDigits(String(count))} سانس`
    const range = `${date} تا ${finish}`
    if (start && end && end !== start) return `${range} (${sessions}) از ${start} تا ${end}`
    if (start) return `${range} (${sessions}) ساعت ${start}`
    return `${range} (${sessions})`
  }
  if (count && date) {
    if (start) return `${date} (${toPersianDigits(String(count))} سانس) ساعت ${start}`
    return `${date} (${toPersianDigits(String(count))} سانس)`
  }
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
    if (data.paymentPaid !== true && !String(data.payPin || '').trim()) lines.push('لینک پرداخت:')
    if (data.paymentPaid === true || !String(data.payPin || '').trim()) lines.push(receiptUrl)
  }
  const payPin = String(data.payPin || '').trim()
  if (payPin && data.paymentPaid !== true) {
    lines.push('کد پرداخت')
    lines.push(payPin)
  }
  return lines
}

/**
 * Short Persian free-text bodies for Kavenegar sms/send (needs KAVENEGAR_SENDER when live).
 * OTP uses Verify Lookup separately — do not route these through KAVENEGAR_TEMPLATE.
 */
const TEMPLATE_BODIES: Record<NotifyTemplate | 'CAMPAIGN', (data: Record<string, unknown>) => string> = {
  /** Prefer SMS OTP for reset; URL form kept for email/log fallback only. */
  PASSWORD_RESET: (data) => {
    const code = String(data.resetCode || data.code || '').trim()
    if (code) return `کد بازیابی رمز اینباکس: ${code}`
    return `بازیابی رمز اینباکس: ${data.resetUrl || ''}`
  },
  BOOKING_CONFIRMED: (data) => {
    const guestBody = renderGuestBookingConfirmed(data)
    if (guestBody) return guestBody

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
    const detail = [court, when, tracking ? `کد ${toPersianDigits(tracking)}` : '']
      .filter(Boolean)
      .join(' | ')
    const lines = [guest ? `رزرو ${guest} لغو شد` : 'رزرو لغو شد']
    if (detail) lines.push('', detail)
    lines.push('', 'Inboxs')
    return lines.join('\n')
  },
  BOOKING_PAID: (data) => {
    const when = whenBit(data)
    return when
      ? `پرداخت رزرو ثبت شد${clubBit(data)} — ${when}. اینباکس`
      : `پرداخت رزرو ثبت شد${clubBit(data)}. اینباکس`
  },
  /**
   * Owner “سفارش جدید” — full multi-line body for SmsLog / free-text.
   * Live Verify Lookup still packs via token10 (~100 chars); URL punctuation is stripped.
   */
  OWNER_BOOKING_CONFIRMED: (data) => {
    const code = String(data.trackingCode || data.orderCode || '').trim()
    const club = String(data.clubName || '').trim()
    const buyer = String(data.guestName || data.userName || '').trim()
    const phone = String(data.guestPhone || data.phone || '').trim()
    const detailUrl = String(data.orderUrl || data.receiptUrl || data.detailUrl || '').trim()

    const sessionLines: string[] = []
    const rawSessions = data.sessions
    if (Array.isArray(rawSessions)) {
      for (const row of rawSessions) {
        if (!row || typeof row !== 'object') continue
        const s = row as Record<string, unknown>
        const court = String(s.courtName || s.court || '').trim()
        const dateRaw = String(s.date || '').trim()
        const startRaw = String(s.startTime || s.time || '').trim()
        const endRaw = String(s.endTime || '').trim()
        const date = dateRaw ? formatSmsJalaliDate(dateRaw) : ''
        const start = startRaw ? formatSmsTime(startRaw) : ''
        const end = endRaw ? formatSmsTime(endRaw) : ''
        const when = start && end && end !== start
          ? `${start} تا ${end}`
          : start || end
        const line = [court, date, when].filter(Boolean).join(' | ')
        if (line) sessionLines.push(line)
      }
    }
    if (!sessionLines.length) {
      const court = String(data.courtName || '').trim()
      const when = whenBit(data)
      const line = [court, when].filter(Boolean).join(' | ')
      if (line) sessionLines.push(line)
    }

    const header = code
      ? `Inboxs | سفارش جدید ${toPersianDigits(code)}`
      : 'Inboxs | سفارش جدید'
    const meta = [
      club ? `باشگاه: «${club}»` : '',
      buyer ? `خریدار: ${buyer}` : '',
      phone ? `شماره تماس: ${toPersianDigits(phone)}` : '',
    ].filter(Boolean)
    const lines = [header, '', ...meta, '', 'مشخصات:', ...sessionLines]
    if (detailUrl) lines.push('', 'مشاهده جزئیات سفارش:', detailUrl)
    lines.push('', 'Inboxs')
    return lines.join('\n')
  },
  /**
   * Kept for email / logs. Live owner SMS after payment uses OWNER_BOOKING_CONFIRMED
   * (notifyOwnerBookingPaid → notifyOwnerBookingConfirmed) — no separate paid SMS.
   */
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
    const who = guestPhone ? `${guest} (${toPersianDigits(guestPhone)})` : guest
    const lines = ['Inboxs | لغو رزرو', '', who]
    if (when) lines.push('', when)
    if (court) lines.push(court)
    lines.push('', 'Inboxs')
    return lines.join('\n')
  },
  /**
   * One short SMS: Persian ping + owner calendar URL. No courts/times/guests.
   * Live notify still uses Verify Lookup %token10% (same as BOOKING_CONFIRMED).
   * token10 strips URL punctuation (`://`, `/`, `.`) so the delivered live text
   * is not a tappable https link; SmsLog / log mode keep the real URL.
   */
  OWNER_DAILY_RESERVATIONS: (data) => {
    return [
      'صاحب باشگاه عزیز',
      '',
      'شما از سایت Inboxs رزرو دارید.',
      '',
      ownerDailyReservationsCalendarUrl(data),
      '',
      'Inboxs',
    ].join('\n')
  },
  CLUB_APPROVED: (data) => [
    `باشگاه «${data.clubName || ''}»`,
    'در Inboxs تأیید شد.',
    '',
    'Inboxs',
  ].join('\n'),
  COACH_APPROVED: (data) => [
    `پروفایل مربی «${data.coachName || ''}»`,
    'در Inboxs تأیید شد.',
    '',
    'Inboxs',
  ].join('\n'),
  COACH_REJECTED: (data) => {
    const note = String(data.note || '').trim()
    const lines = [
      `درخواست مربی «${data.coachName || ''}»`,
      'در Inboxs تأیید نشد.',
    ]
    if (note) lines.push('', note)
    lines.push('', 'Inboxs')
    return lines.join('\n')
  },
  WAITLIST_SLOT_AVAILABLE: (data) => {
    const club = String(data.clubName || '').trim()
    const when = whenBit(data)
    const lines = ['نوبت آزاد شد']
    if (club || when) lines.push('')
    if (club) lines.push(`باشگاه: «${club}»`)
    if (when) lines.push(when)
    lines.push('', 'سریع رزرو کنید.', '', 'Inboxs')
    return lines.join('\n')
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
  ADMIN_COACH_APPLICATION: (data) => {
    const coach = String(data.coachName || '').trim() || 'مربی'
    const city = String(data.city || '').trim()
    const phone = String(data.phone || '').trim()
    return [
      'درخواست مربی',
      coach,
      city,
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

function otpAutofillHost() {
  try {
    const base = (process.env.NUXT_PUBLIC_SITE_URL || 'https://inboxs.ir').replace(/\/$/, '')
    return new URL(base).hostname
  } catch {
    return 'inboxs.ir'
  }
}

/**
 * OTP body for log/fallback `sms/send`.
 * Live Verify Lookup text comes from the panel template — keep this in sync for log mode.
 * Panel `inbox-verify-autofill` (عملیاتی):
 *   code: %token%
 *   کد تایید اینباکس
 *   @inboxs.ir #%token2%
 */
export function renderOtpSms(code: string) {
  const host = otpAutofillHost()
  return [
    `code: ${code}`,
    'کد تایید اینباکس',
    `@${host} #${code}`,
  ].join('\n')
}

export function renderSmsTemplate(template: NotifyTemplate | 'CAMPAIGN', data: Record<string, unknown>) {
  const render = TEMPLATE_BODIES[template]
  return render ? render(data) : String(data.message || '')
}
