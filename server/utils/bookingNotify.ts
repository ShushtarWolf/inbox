import { normalizeIranPhone } from '#shared/phone.ts'
import { resolveSmsProvider } from '#shared/sms.ts'
import { notifyAdminSms } from './adminNotify'
import { createInAppNotification, sendNotification } from './notify'
import { bookingTrackingCode, receiptUrlForBooking } from './receipt'
import { renderSmsTemplate } from './sms/templates'

export type BookingNotifyKind = 'court' | 'coach' | 'package'

type BookingNotifyOpts = {
  /** When absent (desk walk-in / guest-only), in-app is skipped; SMS/email still run if phone/email present. */
  userId?: string | null
  email?: string | null
  phone?: string | null
  clubName: string
  date: string
  startTime: string
  endTime?: string | null
  kind: BookingNotifyKind
  bookingId?: string
  clubId?: string
  courtName?: string | null
  paymentPaid?: boolean
  address?: string | null
  mapsUrl?: string | null
  guestName?: string | null
  trackingCode?: string | null
  receiptUrl?: string | null
  /** Paid amount in product currency units (same as Payment.amount). */
  amountPaid?: number | null
  /** Skip athlete/guest channels but still alert platform admin. */
  skipGuest?: boolean
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
  return (court.nameFa || court.nameEn || '').trim()
}

export function personNotifyName(...parts: Array<string | null | undefined>) {
  return parts.map((part) => String(part || '').trim()).filter(Boolean).join(' ')
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

function bookingNotifyData(opts: BookingNotifyOpts) {
  const trackingCode = opts.trackingCode || (opts.bookingId ? bookingTrackingCode(opts.bookingId) : '')
  const receiptUrl = opts.receiptUrl || (opts.bookingId ? receiptUrlForBooking(opts.bookingId) : '')
  return {
    kind: opts.kind,
    clubName: opts.clubName,
    date: opts.date,
    startTime: opts.startTime,
    endTime: opts.endTime || '',
    courtName: opts.courtName || '',
    paymentPaid: opts.paymentPaid,
    address: opts.address || '',
    mapsUrl: opts.mapsUrl || '',
    guestName: opts.guestName || '',
    trackingCode,
    receiptUrl,
    amountPaid: opts.amountPaid ?? null,
  }
}

function whenLine(opts: BookingNotifyOpts) {
  const start = opts.startTime
  const end = opts.endTime
  const time = start && end && end !== start ? `از ${start} تا ${end}` : start
  const when = [opts.date, time].filter(Boolean).join(' ')
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
 * Soft-fail SMS to club owner when a booking becomes PAID.
 * Delivered via Kavenegar Verify Lookup (inbox-notify / token10) on live service lines.
 */
export async function notifyOwnerBookingPaid(opts: OwnerBookingPaidOpts) {
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
    amountPaid: opts.amountPaid ?? null,
    trackingCode,
  }
  await safeSms(opts.ownerPhone, 'OWNER_BOOKING_PAID', data, opts.clubId)
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
