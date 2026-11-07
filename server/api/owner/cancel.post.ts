import { normalizeIranPhone } from '#shared/phone.ts'
import { notifyUserDisplayName } from '#shared/userName.ts'
import {
  notifyBookingCancelled,
  notifyOwnerBookingCancelled,
  clubNotifyName,
  courtNotifyName,
  ownerNotifyPhone,
  personNotifyName,
  skipGuestBookingSms,
} from '../../utils/bookingNotify'
import { cancelCourtBooking } from '../../utils/cancellations'
import { cancelOwnerSeriesBookings, loadOwnerSeriesBookings } from '../../utils/ownerSeriesCancel'
import { activeSlotBooking } from '../../utils/reservations'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{
    slotId?: string
    scope?: 'series'
    reason?: string
    skipNotify?: boolean
    notifyStartTime?: string
    notifyEndTime?: string
  }>(event)
  if (!body.slotId) throw createError({ statusCode: 400, statusMessage: 'slotId required' })

  const slot = await prisma.slot.findFirst({
    where: { id: body.slotId, court: { clubId: club.id } },
    include: { booking: { include: { payment: true, user: true } }, court: true },
  })
  if (!slot) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const booking = activeSlotBooking(slot.booking)
  if (body.scope === 'series' && booking) {
    const series = await loadOwnerSeriesBookings(club.id, booking.id)
    if (series.length) {
      const reason = body.reason || 'owner-cancel-series'
      const { cancelled, skippedPast, cancelledBookingIds } = await cancelOwnerSeriesBookings({
        rows: series,
        reason,
        moneyOutcome: 'full_wallet_refund',
      })
      const cancelledIds = new Set(cancelledBookingIds)
      for (const row of series) {
        if (!cancelledIds.has(row.id)) continue
        await notifyWaitlistForFreedSlot({
          clubId: club.id,
          courtId: row.slot.courtId,
          date: row.slot.date,
          startTime: row.slot.startTime,
          endTime: row.slot.endTime,
        })
      }
      const anchor = series.find((row) => row.id === booking.id) || series[0]!
      const rawGuest = anchor.guestMobile
      const phone = anchor.user?.phone || (rawGuest ? normalizeIranPhone(rawGuest) || rawGuest : null)
      const guestName = personNotifyName(anchor.guestName, anchor.guestFamily)
        || notifyUserDisplayName(anchor.user)
      if (!body.skipNotify) {
        await notifyOwnerBookingCancelled({
          ownerPhone: ownerNotifyPhone(club),
          clubName: clubNotifyName(club),
          clubId: club.id,
          bookingId: anchor.id,
          date: anchor.slot.date,
          startTime: anchor.slot.startTime,
          endTime: anchor.slot.endTime,
          courtName: courtNotifyName(anchor.slot.court),
          guestName,
          guestPhone: phone,
        })
      }
      await notifyBookingCancelled({
        userId: anchor.userId,
        email: anchor.user?.email,
        phone,
        kind: 'court',
        clubName: clubNotifyName(club),
        clubId: club.id,
        bookingId: anchor.id,
        date: anchor.slot.date,
        startTime: anchor.slot.startTime,
        endTime: anchor.slot.endTime,
        reason,
        guestName,
        courtName: courtNotifyName(anchor.slot.court),
        skipGuest: skipGuestBookingSms(anchor),
      })
      return {
        ok: true,
        cancelled,
        skippedPast,
        moneyOutcome: 'full_wallet_refund',
      }
    }
  }
  if (booking) {
    const reason = body.reason || 'owner-cancel'
    await cancelCourtBooking({
      bookingId: booking.id,
      slotId: slot.id,
      reason,
      paymentId: booking.payment?.id,
      userId: booking.userId,
      moneyOutcome: 'full_wallet_refund',
    })
    const rawGuest = booking.guestMobile
    const phone = booking.user?.phone || (rawGuest ? normalizeIranPhone(rawGuest) || rawGuest : null)
    const notifyStart = (body.notifyStartTime || slot.startTime).trim()
    const notifyEnd = (body.notifyEndTime || slot.endTime).trim()
    const guestName = personNotifyName(booking.guestName, booking.guestFamily)
      || notifyUserDisplayName(booking.user)
    if (!body.skipNotify) {
      await notifyOwnerBookingCancelled({
        ownerPhone: ownerNotifyPhone(club),
        clubName: clubNotifyName(club),
        clubId: club.id,
        bookingId: booking.id,
        date: slot.date,
        startTime: notifyStart,
        endTime: notifyEnd,
        courtName: courtNotifyName(slot.court),
        guestName,
        guestPhone: phone,
      })
    }
    await notifyBookingCancelled({
      userId: booking.userId,
      email: booking.user?.email,
      phone,
      kind: 'court',
      clubName: clubNotifyName(club),
      clubId: club.id,
      bookingId: booking.id,
      date: slot.date,
      startTime: notifyStart,
      endTime: notifyEnd,
      reason,
      guestName,
      courtName: courtNotifyName(slot.court),
      skipGuest: skipGuestBookingSms(booking),
    })
  }
  else {
    await prisma.slot.update({
      where: { id: slot.id },
      data: { displayStatus: 'FREE' },
    })
  }

  await notifyWaitlistForFreedSlot({
    clubId: club.id,
    courtId: slot.courtId,
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
  })

  return { ok: true, moneyOutcome: 'full_wallet_refund' }
})
