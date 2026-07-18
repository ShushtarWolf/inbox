import { createInAppNotification, sendNotification } from './notify'

export type BookingNotifyKind = 'court' | 'coach' | 'package'

type BookingNotifyOpts = {
  userId: string
  email?: string | null
  clubName: string
  date: string
  startTime: string
  kind: BookingNotifyKind
  bookingId?: string
  clubId?: string
}

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
  template: 'BOOKING_CONFIRMED' | 'BOOKING_CANCELLED' | 'BOOKING_PAID',
  data: Record<string, unknown>,
) {
  if (!email) return
  try {
    await sendNotification({ channel: 'email', to: email, template, data })
  } catch (err) {
    console.error('[bookingNotify:email]', template, err)
  }
}

/** Booking created (platform creates as CONFIRMED). In-app always; email when address present. */
export async function notifyBookingConfirmed(opts: BookingNotifyOpts) {
  const label = kindLabel(opts.kind)
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
  await safeEmail(opts.email, 'BOOKING_CONFIRMED', {
    kind: opts.kind,
    clubName: opts.clubName,
    date: opts.date,
    startTime: opts.startTime,
  })
}

export async function notifyBookingCancelled(opts: BookingNotifyOpts & { reason?: string }) {
  const label = kindLabel(opts.kind)
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
  await safeEmail(opts.email, 'BOOKING_CANCELLED', {
    kind: opts.kind,
    clubName: opts.clubName,
    date: opts.date,
    startTime: opts.startTime,
  })
}

/** Pay-at-club (or other) marked paid — notify the linked athlete when present. */
export async function notifyBookingPaid(opts: BookingNotifyOpts) {
  const label = kindLabel(opts.kind)
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
  await safeEmail(opts.email, 'BOOKING_PAID', {
    kind: opts.kind,
    clubName: opts.clubName,
    date: opts.date,
    startTime: opts.startTime,
  })
}
