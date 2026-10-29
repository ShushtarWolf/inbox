import { normalizeIranPhone } from '#shared/phone.ts'
import { requireAdminSecret } from '../../../utils/adminAuth'
import {
  clubNotifyLocation,
  clubNotifyName,
  courtNotifyName,
  personNotifyName,
  resendBookingPaidSms,
} from '../../../utils/bookingNotify'
import { loadOwnerSeriesBookings } from '../../../utils/ownerSeriesCancel'
import { renderSmsTemplate } from '../../../utils/sms/templates'

/**
 * Ops: resend the athlete «رزرو شما با موفقیت ثبت شد» SMS for paid desk bookings / seasons
 * whose original send failed. Pass the season primary booking id (or a single booking id).
 */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const body = await readBody<{ bookingIds?: unknown; dryRun?: boolean }>(event)
  const ids = Array.isArray(body?.bookingIds)
    ? [...new Set(body.bookingIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())))]
    : []
  if (!ids.length || ids.length > 50) {
    throw createError({ statusCode: 400, statusMessage: 'bookingIds (1–50) required' })
  }

  const results = []
  for (const id of ids) {
    const anchor = await prisma.booking.findUnique({
      where: { id },
      include: { user: true, slot: { include: { court: { include: { club: true } } } } },
    })
    const club = anchor?.slot?.court?.club
    if (!anchor || !club) {
      results.push({ id, sent: false, reason: 'not_found' })
      continue
    }
    const series = await loadOwnerSeriesBookings(club.id, id)
    const rows = (series.length ? series : [anchor]).filter((row) => row.status !== 'CANCELLED')
    if (!rows.length || rows.some((row) => row.paymentStatus !== 'PAID')) {
      results.push({ id, sent: false, reason: 'not_paid' })
      continue
    }
    const phone = anchor.user?.phone
      || (anchor.guestMobile ? normalizeIranPhone(anchor.guestMobile) || anchor.guestMobile : null)
    if (!phone) {
      results.push({ id, sent: false, reason: 'no_phone' })
      continue
    }
    const first = rows[0]!.slot
    const last = rows[rows.length - 1]!.slot
    const opts = {
      phone,
      kind: 'court' as const,
      clubName: clubNotifyName(club),
      clubId: club.id,
      bookingId: id,
      date: first.date,
      finishDate: last.date,
      startTime: first.startTime,
      endTime: first.endTime,
      sessionCount: rows.length,
      sessions: rows.map((row) => ({
        courtName: courtNotifyName(row.slot.court),
        date: row.slot.date,
        startTime: row.slot.startTime,
        endTime: row.slot.endTime,
      })),
      paymentPaid: true,
      guestName: personNotifyName(anchor.guestName, anchor.guestFamily) || anchor.user?.name || '',
      ...clubNotifyLocation(club),
    }
    if (body?.dryRun) {
      const preview = renderSmsTemplate('BOOKING_PAID', opts)
      results.push({ id, phone, sessions: rows.length, dryRun: true, length: preview.length })
      continue
    }
    const sent = await resendBookingPaidSms(opts)
    results.push({ id, phone, sessions: rows.length, sent })
  }
  return { results }
})
