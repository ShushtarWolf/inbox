import { formatGuestDisplayName } from '#shared/guestName.ts'
import { formatSmsJalaliDate, formatSmsTime, toPersianDigits } from '#shared/jalali.ts'
import { normalizeIranPhone } from '#shared/phone.ts'
import { resolveSmsProvider } from '#shared/sms.ts'
import { notifyAdminSms } from './adminNotify'
import { createInAppNotification, sendNotification } from './notify'
import { bookingTrackingCode, payUrlForPin, receiptUrlForBooking } from './receipt'
import { renderSmsTemplate } from './sms/templates'
import { sendSms } from './sms/service'

export type BookingNotifyKind = 'court' | 'coach' | 'package'

export type BookingNotifySessionLine = {
  courtName?: string | null
  date: string
  startTime: string
  endTime?: string | null
}

type BookingNotifyOpts = {
  /** When absent (desk walk-in / guest-only), in-app is skipped; SMS/email still run if phone/email present. */
  userId?: string | null
  email?: string | null
  phone?: string | null
  clubName: string
  date: string
  /** Inclusive series end — when set with sessionCount > 1, copy describes a recurring range. */
  finishDate?: string | null
  startTime: string
  endTime?: string | null
  /** Number of sessions created in a season/package series. */
  sessionCount?: number | null
  /** Explicit session lines for guest SMS «مشخصات رزرو». */
  sessions?: BookingNotifySessionLine[]
  kind: BookingNotifyKind
  bookingId?: string
  clubId?: string
  courtName?: string | null
  /** Court number/label for package SMS («زمین شماره (… )»). */
  courtNumber?: string | null
  /** Class package title when kind === 'package'. */
  packageName?: string | null
  /** Athlete dashboard link override (defaults to /athlete/bookings). */
  dashboardUrl?: string | null
  paymentPaid?: boolean
  address?: string | null
  mapsUrl?: string | null
  guestName?: string | null
  trackingCode?: string | null
  receiptUrl?: string | null
  /** Alphanumeric desk pay pin — SMS-safe; /p/:pin opens the receipt. */
  payPin?: string | null
  payUrl?: string | null
  /** Paid amount in product currency units (same as Payment.amount). */
  amountPaid?: number | null
  /** Skip athlete/guest channels but still alert platform admin. */
  skipGuest?: boolean
}

export type OwnerBookingSessionLine = BookingNotifySessionLine

type OwnerBookingConfirmedOpts = {
  ownerPhone?: string | null
  clubName: string
  clubId?: string
  bookingId?: string
  guestName?: string | null
  guestPhone?: string | null
  trackingCode?: string | null
  /** Receipt / order detail URL shown under «مشاهده جزئیات سفارش». */
  orderUrl?: string | null
  /** One line per court session: زمین | تاریخ | شروع تا پایان */
  sessions?: OwnerBookingSessionLine[]
  /** Fallback when sessions is empty — single court/time. */
  date?: string
  startTime?: string
  endTime?: string | null
  courtName?: string | null
}

type OwnerBookingPaidOpts = {
  ownerPhone?: string | null
  clubName: string
  clubId?: string
  bookingId?: string
  date: string
  startTime: string
  endTime?: string | null
  courtName?: string | null
  guestName?: string | null
  guestPhone?: string | null
  amountPaid?: number | null
  trackingCode?: string | null
}

type BookingSmsTemplate =
  | 'BOOKING_CONFIRMED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_PAID'
  | 'OWNER_BOOKING_CONFIRMED'
  | 'OWNER_BOOKING_PAID'
  | 'OWNER_BOOKING_CANCELLED'
  | 'WAITLIST_SLOT_AVAILABLE'

function kindLabelFa(kind: BookingNotifyKind) {
  if (kind === 'coach') return 'جلسه مربی'
  if (kind === 'package') return 'رزرو پکیج'
  return 'رزرو زمین'
}

/** Prefer Persian club name for FA product SMS / in-app. */
export function clubNotifyName(club: { nameFa?: string | null; nameEn?: string | null }) {
  return (club.nameFa || club.nameEn || '').trim() || 'باشگاه'
}

export function courtNotifyName(court: { nameFa?: string | null; nameEn?: string | null }) {
  return toPersianDigits((court.nameFa || court.nameEn || '').trim())
}

export function personNotifyName(...parts: Array<string | null | undefined>) {
  return parts.reduce((acc, part) => formatGuestDisplayName(acc, part), '')
}

/** Owner account mobile first, then club mobile — landlines skipped (SMS only). */
export function ownerNotifyPhone(club: {
  phone?: string | null
  owner?: { phone?: string | null } | null
}) {
  for (const raw of [club.owner?.phone, club.phone]) {
    const mobile = normalizeIranPhone(raw)
    if (mobile) return mobile
  }
  return null
}

type OwnerBookingCancelledOpts = {
  ownerPhone?: string | null
  clubName: string
  clubId?: string
  bookingId?: string
  date: string
  startTime: string
  endTime?: string | null
  courtName?: string | null
  guestName?: string | null
  guestPhone?: string | null
  trackingCode?: string | null
}

export function clubNotifyLocation(club: {
  addressFa?: string | null
  addressEn?: string | null
  lat?: number | null
  lng?: number | null
}) {
  const address = (club.addressFa || club.addressEn || '').trim()
  const lat = club.lat
  const lng = club.lng
  const mapsUrl =
    typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
      ? `https://maps.google.com/?q=${lat},${lng}`
      : ''
  return { address, mapsUrl }
}

async function safeInApp(opts: Parameters<typeof createInAppNotification>[0]) {
  try {
    await createInAppNotification(opts)
  } catch (err) {
    console.error('[bookingNotify:in_app]', opts.type, err)
  }
}

async function safeEmail(
  email: string | null | undefined,
  template: BookingSmsTemplate,
  data: Record<string, unknown>,
) {
  if (!email) return
  try {
    await sendNotification({ channel: 'email', to: email, template, data })
  } catch (err) {
    console.error('[bookingNotify:email]', template, err)
  }
}

/**
 * Soft-fail SMS so booking flows never break.
 * Log mode: still renders Persian body, logs template+phone+body for QA, and routes through
 * the log SMS provider (SmsLog row when clubId is set) — never claims live delivery.
 * Live mode: same path → Kavenegar when env is unlocked.
 */
/** Soft-fail SMS — same Kavenegar/log path for booking + waitlist. */
export async function notifySmsSoft(
  phone: string | null | undefined,
  template: BookingSmsTemplate,
  data: Record<string, unknown>,
  clubId?: string,
) {
  if (!phone) return
  const mode = resolveSmsProvider()
  const body = renderSmsTemplate(template, data)
  // Always audit intended payload (QA without live Kavenegar).
  console.log('[bookingNotify:sms]', mode, template, phone, body)
  try {
    await sendNotification({ channel: 'sms', to: phone, template, data, clubId })
  } catch (err) {
    console.error('[bookingNotify:sms]', template, err)
  }
}

async function safeSms(
  phone: string | null | undefined,
  template: BookingSmsTemplate,
  data: Record<string, unknown>,
  clubId?: string,
) {
  return notifySmsSoft(phone, template, data, clubId)
}

function payLinkLookupTemplate() {
  return process.env.KAVENEGAR_TEMPLATE_PAY_LINK?.trim() || ''
}

/**
 * Optional tappable pay-link SMS via dedicated Verify Lookup template
 * (e.g. panel `payments` with `https://inboxs.ir/p/%token%`).
 * Works on Path A too — Lookup is independent of free-text notify.
 */
export async function sendBookingPayLinkSms(opts: {
  phone: string | null | undefined
  payPin: string
  payUrl?: string
  clubId?: string
}) {
  const template = payLinkLookupTemplate()
  const phone = opts.phone
  const payPin = String(opts.payPin || '').trim()
  if (!phone || !template || !payPin) {
    return { sent: false, reason: !template ? 'template_unset' : 'missing_phone_or_pin' as const }
  }
  try {
    const result = await sendSms({
      to: phone,
      body: opts.payUrl || payPin,
      clubId: opts.clubId,
      purpose: 'notify',
      template: 'BOOKING_CONFIRMED',
      lookup: { template, token: payPin },
    })
    return { sent: Boolean(result.sent), reason: result.sent ? 'ok' as const : 'not_sent' as const }
  } catch (err) {
    console.error('[bookingNotify:sms] BOOKING_PAY_LINK', err)
    return { sent: false, reason: 'error' as const }
  }
}

/** @deprecated use sendBookingPayLinkSms — kept as internal alias for notify path */
async function sendPayLinkLookup(
  phone: string | null | undefined,
  payPin: string,
  payUrl: string,
  clubId?: string,
) {
  await sendBookingPayLinkSms({ phone, payPin, payUrl, clubId })
}

function bookingNotifyData(opts: BookingNotifyOpts) {
  const trackingCode = opts.trackingCode || (opts.bookingId ? bookingTrackingCode(opts.bookingId) : '')
  // Package seats are PackageBooking rows — no court receipt token.
  const receiptUrl = opts.kind === 'package'
    ? (opts.receiptUrl || '')
    : (opts.receiptUrl || (opts.bookingId ? receiptUrlForBooking(opts.bookingId) : ''))
  const payPin = String(opts.payPin || '').trim()
  const payUrl = opts.payUrl || (payPin ? payUrlForPin(payPin) : '')
  const sessions = (opts.sessions?.length
    ? opts.sessions
    : [{
        courtName: opts.courtName || opts.courtNumber || '',
        date: opts.date,
        startTime: opts.startTime,
        endTime: opts.endTime || '',
      }]).map((s) => ({
    courtName: s.courtName || '',
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime || '',
  }))
  return {
    kind: opts.kind,
    clubName: opts.clubName,
    date: opts.date,
    finishDate: opts.finishDate || '',
    startTime: opts.startTime,
    endTime: opts.endTime || '',
    sessionCount: opts.sessionCount ?? null,
    sessions,
    courtName: opts.courtName || '',
    courtNumber: opts.courtNumber || opts.courtName || '',
    packageName: opts.packageName || '',
    dashboardUrl: opts.dashboardUrl || '',
    paymentPaid: opts.paymentPaid,
    address: opts.address || '',
    mapsUrl: opts.mapsUrl || '',
    guestName: opts.guestName || '',
    trackingCode,
    receiptUrl,
    payPin,
    payUrl,
    amountPaid: opts.amountPaid ?? null,
  }
}

/** Shared when-line for in-app / admin — supports single slot or series range. */
export function whenLine(opts: {
  date?: string | null
  finishDate?: string | null
  startTime?: string | null
  endTime?: string | null
  sessionCount?: number | null
}) {
  const start = opts.startTime ? formatSmsTime(opts.startTime) : ''
  const end = opts.endTime ? formatSmsTime(opts.endTime) : ''
  const time = start && end && end !== start ? `از ${start} تا ${end}` : start
  const date = opts.date ? formatSmsJalaliDate(opts.date) : ''
  const finish = opts.finishDate ? formatSmsJalaliDate(opts.finishDate) : ''
  const count = typeof opts.sessionCount === 'number' && opts.sessionCount > 1
    ? opts.sessionCount
    : 0
  if (count && date && finish && finish !== date) {
    const sessions = `${toPersianDigits(String(count))} سانس`
    const range = `${date} تا ${finish}`
    return [range, `(${sessions})`, time].filter(Boolean).join(' ')
  }
  if (count && date) {
    return [`${date} (${toPersianDigits(String(count))} سانس)`, time].filter(Boolean).join(' ')
  }
  const when = [date, time].filter(Boolean).join(' ')
  return when || '—'
}

function adminBookingData(opts: BookingNotifyOpts) {
  return {
    ...bookingNotifyData(opts),
    guestPhone: opts.phone || '',
  }
}

/** Booking created (platform creates as CONFIRMED). In-app when userId; email/SMS when address/phone present. */
export async function notifyBookingConfirmed(opts: BookingNotifyOpts) {
  const label = kindLabelFa(opts.kind)
  const data = bookingNotifyData(opts)
  if (!opts.skipGuest) {
    if (opts.userId) {
      await safeInApp({
        userId: opts.userId,
        type: 'BOOKING_CONFIRMED',
        title: 'رزرو تایید شد',
        body: `${label} در «${opts.clubName}» — ${whenLine(opts)}`,
        metadata: {
          kind: opts.kind,
          clubId: opts.clubId,
          bookingId: opts.bookingId,
          date: opts.date,
          startTime: opts.startTime,
        },
      })
    }
    await safeEmail(opts.email, 'BOOKING_CONFIRMED', data)
    await safeSms(opts.phone, 'BOOKING_CONFIRMED', data, opts.clubId)
    if (!opts.skipGuest && opts.paymentPaid !== true && data.payPin) {
      await sendPayLinkLookup(opts.phone, String(data.payPin), String(data.payUrl || ''), opts.clubId)
    }
  }
  await notifyAdminSms('ADMIN_BOOKING_CONFIRMED', adminBookingData(opts), opts.clubId)
}

export async function notifyBookingCancelled(opts: BookingNotifyOpts & { reason?: string }) {
  const label = kindLabelFa(opts.kind)
  const data = bookingNotifyData(opts)
  if (!opts.skipGuest) {
    if (opts.userId) {
      await safeInApp({
        userId: opts.userId,
        type: 'BOOKING_CANCELLED',
        title: 'رزرو لغو شد',
        body: `${label} در «${opts.clubName}» — ${whenLine(opts)} لغو شد`,
        metadata: {
          kind: opts.kind,
          clubId: opts.clubId,
          bookingId: opts.bookingId,
          date: opts.date,
          startTime: opts.startTime,
          reason: opts.reason,
        },
      })
    }
    await safeEmail(opts.email, 'BOOKING_CANCELLED', data)
    await safeSms(opts.phone, 'BOOKING_CANCELLED', data, opts.clubId)
  }
  await notifyAdminSms('ADMIN_BOOKING_CANCELLED', adminBookingData(opts), opts.clubId)
}

/** Pay-at-club / wallet / online verified — notify linked athlete and/or guest phone. */
export async function notifyBookingPaid(opts: BookingNotifyOpts) {
  const label = kindLabelFa(opts.kind)
  const data = bookingNotifyData(opts)
  if (!opts.skipGuest) {
    if (opts.userId) {
      await safeInApp({
        userId: opts.userId,
        type: 'BOOKING_PAID',
        title: 'پرداخت ثبت شد',
        body: `${label} در «${opts.clubName}» — ${whenLine(opts)} پرداخت شد`,
        metadata: {
          kind: opts.kind,
          clubId: opts.clubId,
          bookingId: opts.bookingId,
          date: opts.date,
          startTime: opts.startTime,
        },
      })
    }
    await safeEmail(opts.email, 'BOOKING_PAID', data)
    await safeSms(opts.phone, 'BOOKING_PAID', data, opts.clubId)
  }
  await notifyAdminSms('ADMIN_BOOKING_PAID', adminBookingData(opts), opts.clubId)
}

/**
 * Soft-fail SMS to club owner («سفارش جدید»).
 * Call after payment is final (via notifyOwnerBookingPaid) or for desk paid-at-create.
 * Full multi-line body is logged; live lookup packs via token10.
 */
export async function notifyOwnerBookingConfirmed(opts: OwnerBookingConfirmedOpts) {
  if (!opts.ownerPhone) return
  const trackingCode = opts.trackingCode || (opts.bookingId ? bookingTrackingCode(opts.bookingId) : '')
  const orderUrl = opts.orderUrl
    || (opts.bookingId ? receiptUrlForBooking(opts.bookingId) : '')
  const data: Record<string, unknown> = {
    clubName: opts.clubName,
    guestName: opts.guestName || '',
    guestPhone: opts.guestPhone || '',
    trackingCode,
    orderUrl,
    receiptUrl: orderUrl,
  }
  if (opts.sessions?.length) {
    data.sessions = opts.sessions
  } else {
    data.date = opts.date || ''
    data.startTime = opts.startTime || ''
    data.endTime = opts.endTime || ''
    data.courtName = opts.courtName || ''
  }
  await safeSms(opts.ownerPhone, 'OWNER_BOOKING_CONFIRMED', data, opts.clubId)
}

/**
 * Soft-fail SMS to club owner when a booking becomes PAID.
 * Product: one «سفارش جدید» SMS (OWNER_BOOKING_CONFIRMED) after payment is final —
 * no separate OWNER_BOOKING_PAID SMS.
 */
export async function notifyOwnerBookingPaid(opts: OwnerBookingPaidOpts) {
  await notifyOwnerBookingConfirmed({
    ownerPhone: opts.ownerPhone,
    clubName: opts.clubName,
    clubId: opts.clubId,
    bookingId: opts.bookingId,
    guestName: opts.guestName,
    guestPhone: opts.guestPhone,
    trackingCode: opts.trackingCode,
    date: opts.date,
    startTime: opts.startTime,
    endTime: opts.endTime,
    courtName: opts.courtName,
  })
}

/** Soft-fail SMS to club owner when a booking is cancelled (athlete or desk). */
export async function notifyOwnerBookingCancelled(opts: OwnerBookingCancelledOpts) {
  if (!opts.ownerPhone) return
  const trackingCode = opts.trackingCode || (opts.bookingId ? bookingTrackingCode(opts.bookingId) : '')
  const data = {
    clubName: opts.clubName,
    date: opts.date,
    startTime: opts.startTime,
    endTime: opts.endTime || '',
    courtName: opts.courtName || '',
    guestName: opts.guestName || '',
    guestPhone: opts.guestPhone || '',
    trackingCode,
  }
  await safeSms(opts.ownerPhone, 'OWNER_BOOKING_CANCELLED', data, opts.clubId)
}
