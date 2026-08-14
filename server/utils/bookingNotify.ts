import { resolveSmsProvider } from '#shared/sms.ts'
import { createInAppNotification, sendNotification } from './notify'
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
  kind: BookingNotifyKind
  bookingId?: string
  clubId?: string
  courtName?: string | null
  paymentPaid?: boolean
  address?: string | null
  mapsUrl?: string | null
}

type BookingSmsTemplate = 'BOOKING_CONFIRMED' | 'BOOKING_CANCELLED' | 'BOOKING_PAID'

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
async function safeSms(
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

function bookingNotifyData(opts: BookingNotifyOpts) {
  return {
    kind: opts.kind,
    clubName: opts.clubName,
    date: opts.date,
    startTime: opts.startTime,
    courtName: opts.courtName || '',
    paymentPaid: opts.paymentPaid,
    address: opts.address || '',
    mapsUrl: opts.mapsUrl || '',
  }
}

function whenLine(opts: BookingNotifyOpts) {
  const when = [opts.date, opts.startTime].filter(Boolean).join(' ')
  return when || '—'
}

/** Booking created (platform creates as CONFIRMED). In-app when userId; email/SMS when address/phone present. */
export async function notifyBookingConfirmed(opts: BookingNotifyOpts) {
  const label = kindLabelFa(opts.kind)
  const data = bookingNotifyData(opts)
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

export async function notifyBookingCancelled(opts: BookingNotifyOpts & { reason?: string }) {
  const label = kindLabelFa(opts.kind)
  const data = bookingNotifyData(opts)
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

/** Pay-at-club / wallet / online verified — notify linked athlete and/or guest phone. */
export async function notifyBookingPaid(opts: BookingNotifyOpts) {
  const label = kindLabelFa(opts.kind)
  const data = bookingNotifyData(opts)
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
