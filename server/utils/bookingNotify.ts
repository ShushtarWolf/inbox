import { resolveSmsProvider } from '#shared/sms.ts'
import { createInAppNotification, sendNotification } from './notify'

export type BookingNotifyKind = 'court' | 'coach' | 'package'

type BookingNotifyOpts = {
  userId: string
  email?: string | null
  phone?: string | null
  clubName: string
  date: string
  startTime: string
  kind: BookingNotifyKind
  bookingId?: string
  clubId?: string
}

type BookingSmsTemplate = 'BOOKING_CONFIRMED' | 'BOOKING_CANCELLED' | 'BOOKING_PAID'

function kindLabel(kind: BookingNotifyKind) {
  if (kind === 'coach') return 'Coach session'
  if (kind === 'package') return 'Package booking'
  return 'Court booking'
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

/** Live SMS only — log mode skips (no fake sent). Soft-fail so booking flows never break. */
async function safeSms(
  phone: string | null | undefined,
  template: BookingSmsTemplate,
  data: Record<string, unknown>,
  clubId?: string,
) {
  if (!phone) return
  if (resolveSmsProvider() !== 'live') {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[bookingNotify:sms:skip]', template, phone)
    }
    return
  }
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
  }
}

/** Booking created (platform creates as CONFIRMED). In-app always; email/SMS when address/phone present. */
export async function notifyBookingConfirmed(opts: BookingNotifyOpts) {
  const label = kindLabel(opts.kind)
  const data = bookingNotifyData(opts)
  await safeInApp({
    userId: opts.userId,
    type: 'BOOKING_CONFIRMED',
    title: 'Booking confirmed',
    body: `${label} at ${opts.clubName} — ${opts.date} ${opts.startTime}`,
    metadata: {
      kind: opts.kind,
      clubId: opts.clubId,
      bookingId: opts.bookingId,
      date: opts.date,
      startTime: opts.startTime,
    },
  })
  await safeEmail(opts.email, 'BOOKING_CONFIRMED', data)
  await safeSms(opts.phone, 'BOOKING_CONFIRMED', data, opts.clubId)
}

export async function notifyBookingCancelled(opts: BookingNotifyOpts & { reason?: string }) {
  const label = kindLabel(opts.kind)
  const data = bookingNotifyData(opts)
  await safeInApp({
    userId: opts.userId,
    type: 'BOOKING_CANCELLED',
    title: 'Booking cancelled',
    body: `${label} at ${opts.clubName} — ${opts.date} ${opts.startTime} was cancelled`,
    metadata: {
      kind: opts.kind,
      clubId: opts.clubId,
      bookingId: opts.bookingId,
      date: opts.date,
      startTime: opts.startTime,
      reason: opts.reason,
    },
  })
  await safeEmail(opts.email, 'BOOKING_CANCELLED', data)
  await safeSms(opts.phone, 'BOOKING_CANCELLED', data, opts.clubId)
}

/** Pay-at-club (or other) marked paid — notify the linked athlete when present. */
export async function notifyBookingPaid(opts: BookingNotifyOpts) {
  const label = kindLabel(opts.kind)
  const data = bookingNotifyData(opts)
  await safeInApp({
    userId: opts.userId,
    type: 'BOOKING_PAID',
    title: 'Payment received',
    body: `${label} at ${opts.clubName} — ${opts.date} ${opts.startTime} marked paid`,
    metadata: {
      kind: opts.kind,
      clubId: opts.clubId,
      bookingId: opts.bookingId,
      date: opts.date,
      startTime: opts.startTime,
    },
  })
  await safeEmail(opts.email, 'BOOKING_PAID', data)
  await safeSms(opts.phone, 'BOOKING_PAID', data, opts.clubId)
}
