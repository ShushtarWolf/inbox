import { parseSeriesPaymentMeta } from '#shared/athleteSeason.ts'
import { isPaidPaymentStatus } from '#shared/bookingPayment.ts'
import { isSeriesDeskPaymentTarget, seriesDeskPaymentCreates } from '#shared/ownerSeries.ts'
import { normalizeIranPhone } from '#shared/phone.ts'
import { notifyUserDisplayName } from '#shared/userName.ts'
import {
  notifyBookingPaid,
  notifyOwnerBookingPaid,
  clubNotifyName,
  courtNotifyName,
  ownerNotifyPhone,
  personNotifyName,
} from '../../utils/bookingNotify'
import { releaseExpiredOnlinePaymentHolds } from '../../utils/onlinePaymentHold'
import { loadOwnerSeriesBookings } from '../../utils/ownerSeriesCancel'
import { activeSlotBooking } from '../../utils/reservations'

/**
 * Desk cash for a whole season/class package in one go.
 * Existing payment amounts are kept: pay-link seasons hold the total on the primary row.
 * Missing payment rows mint one charged primary + amount-0 siblings (not N× list price).
 */
export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{ slotId?: string; paymentStatus?: string; dryRun?: boolean }>(event)
  if (!body.slotId) throw createError({ statusCode: 400, statusMessage: 'slotId required' })
  const next = body.paymentStatus === 'PAID' ? 'PAID' : 'PAY_AT_CLUB'

  await releaseExpiredOnlinePaymentHolds({ clubId: club.id })
  const slot = await prisma.slot.findFirst({
    where: { id: body.slotId, court: { clubId: club.id } },
    include: { booking: true },
  })
  const booking = activeSlotBooking(slot?.booking)
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const series = await loadOwnerSeriesBookings(club.id, booking.id)
  const targets = series.filter((row) => isSeriesDeskPaymentTarget(row, next))
  const missing = targets.filter((row) => !row.payment)
  const seasonBookingId = series
    .map((row) => parseSeriesPaymentMeta(row.payment?.metadataJson).seasonBookingId)
    .find((id): id is string => Boolean(id))
  const creates = seriesDeskPaymentCreates(
    missing.map((row) => ({ id: row.id, slotPrice: row.slot.price ?? 0 })),
    seasonBookingId ? { seasonBookingId } : undefined,
  )
  const createByBookingId = new Map(creates.map((row) => [row.bookingId, row]))
  const amount = targets.reduce((sum, row) => {
    if (row.payment) return sum + row.payment.amount
    return sum + (createByBookingId.get(row.id)?.amount ?? 0)
  }, 0)
  if (body.dryRun || !targets.length) return { ok: true, count: targets.length, amount }

  if (next !== 'PAID') {
    for (const row of targets) {
      const pay = row.payment
      if (
        pay
        && isPaidPaymentStatus(pay.status)
        && (pay.method === 'IPG' || pay.method === 'PAID')
      ) {
        throw createError({
          statusCode: 409,
          statusMessage: 'Online paid series must be cancelled to refund',
        })
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const row of targets) {
      await tx.booking.update({
        where: { id: row.id },
        data: { paymentStatus: next, paymentMethod: 'CASH', status: 'CONFIRMED' },
      })
      const minted = createByBookingId.get(row.id)
      await tx.payment.upsert({
        where: { bookingId: row.id },
        update: {
          method: 'CASH',
          status: next,
          ...(next !== 'PAID' && row.payment?.method === 'CASH'
            ? {
                metadataJson: JSON.stringify({
                  ...parseSeriesPaymentMeta(row.payment.metadataJson),
                  markUnpaidCash: true,
                  markUnpaidAt: new Date().toISOString(),
                }),
              }
            : {}),
        },
        create: {
          bookingId: row.id,
          amount: minted?.amount ?? 0,
          method: 'CASH',
          status: next,
          ...(minted?.metadataJson ? { metadataJson: minted.metadataJson } : {}),
        },
      })
    }
  })

  // One SMS for the whole package, not one per session.
  if (next === 'PAID') {
    const first = targets[0]!
    const phone = first.user?.phone || (first.guestMobile ? normalizeIranPhone(first.guestMobile) || first.guestMobile : null)
    const guestName = personNotifyName(first.guestName, first.guestFamily)
      || notifyUserDisplayName(first.user)
      || ''
    const notify = {
      clubId: club.id,
      bookingId: first.id,
      date: first.slot.date,
      startTime: first.slot.startTime,
      endTime: first.slot.endTime,
      courtName: courtNotifyName(first.slot.court),
      guestName,
    }
    await notifyBookingPaid({
      ...notify,
      userId: first.userId,
      email: first.user?.email,
      phone,
      kind: 'court',
      clubName: clubNotifyName(club),
      amountPaid: amount,
      paymentPaid: true,
      skipGuest: true,
    })
    const ownerClub = await prisma.club.findUnique({
      where: { id: club.id },
      select: { phone: true, nameFa: true, nameEn: true, owner: { select: { phone: true } } },
    })
    await notifyOwnerBookingPaid({
      ...notify,
      ownerPhone: ownerClub ? ownerNotifyPhone(ownerClub) : club.phone,
      clubName: clubNotifyName(ownerClub || club),
      guestPhone: phone,
      amountPaid: amount,
    })
  }

  return { ok: true, count: targets.length, amount }
})
