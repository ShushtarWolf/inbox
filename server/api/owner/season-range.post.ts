import { addDaysToIsoDate } from '#shared/localDate.ts'
import { ownerSeriesKey, seriesCancelPaymentId } from '#shared/ownerSeries.ts'
import {
  deriveSeasonRulesFromSlots,
  expandSeasonRules,
  maxIsoDate,
} from '#shared/seasonSessions.ts'
import { cancelCourtBooking } from '../../utils/cancellations'
import { loadOwnerSeriesBookings } from '../../utils/ownerSeriesCancel'
import { activeSlotBooking } from '../../utils/reservations'
import { createSeasonSessions, previewSeasonSessions } from '../../utils/seasonReserve'
import { assertRecurringReserveEnabled } from '../../utils/recurringReserveGate'
import { notifyWaitlistForFreedSlot } from '../../utils/waitlistNotify'

/**
 * Change the finish date of an owner season series.
 * Extend creates new sessions from rules derived from live slots.
 * Shorten cancels sessions after the new finish (wallet refund).
 */
export default defineEventHandler(async (event) => {
  assertRecurringReserveEnabled(event)
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{
    slotId?: string
    finishDate?: string
    dryRun?: boolean
  }>(event)

  const slotId = body.slotId?.trim()
  const finishDate = body.finishDate?.trim()
  if (!slotId) throw createError({ statusCode: 400, statusMessage: 'slotId required' })
  if (!finishDate || !/^\d{4}-\d{2}-\d{2}$/.test(finishDate)) {
    throw createError({ statusCode: 400, statusMessage: 'finishDate required' })
  }

  const slot = await prisma.slot.findFirst({
    where: { id: slotId, court: { clubId: club.id } },
    include: {
      booking: {
        include: {
          payment: { select: { metadataJson: true } },
          events: { where: { type: 'CREATED' }, select: { metadataJson: true }, take: 4 },
        },
      },
    },
  })
  const booking = activeSlotBooking(slot?.booking)
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const key = ownerSeriesKey({
    packageDraftId: booking.packageDraftId,
    paymentMetadataJson: booking.payment?.metadataJson,
    eventMetadataJson: booking.events.map((row) => row.metadataJson),
  })
  if (!key || key.kind !== 'season') {
    throw createError({ statusCode: 400, statusMessage: 'Not a season series' })
  }

  const season = await prisma.seasonBooking.findFirst({
    where: { id: key.id, clubId: club.id },
  })
  if (!season) throw createError({ statusCode: 404, statusMessage: 'Season not found' })

  const series = await loadOwnerSeriesBookings(club.id, booking.id)
  if (!series.length) throw createError({ statusCode: 404, statusMessage: 'Series empty' })

  const firstDate = series[0]!.slot.date
  const lastDate = series[series.length - 1]!.slot.date
  const startDate = season.startDate || firstDate
  const currentEnd = maxIsoDate(season.finishDate, lastDate) || lastDate

  if (finishDate < startDate) {
    throw createError({ statusCode: 400, statusMessage: 'Finish date must be on or after start date' })
  }
  if (finishDate === currentEnd) {
    return { ok: true, action: 'noop' as const, finishDate, count: series.length }
  }

  if (finishDate < currentEnd) {
    const toCancel = series.filter((row) => row.slot.date > finishDate)
    if (body.dryRun) {
      return {
        ok: true,
        action: 'shorten' as const,
        finishDate,
        cancelCount: toCancel.length,
        createCount: 0,
        skipCount: 0,
      }
    }
    for (const row of toCancel) {
      await cancelCourtBooking({
        bookingId: row.id,
        slotId: row.slotId,
        reason: 'owner-season-shorten',
        paymentId: seriesCancelPaymentId(row.payment),
        userId: row.userId,
        moneyOutcome: 'full_wallet_refund',
      })
      await notifyWaitlistForFreedSlot({
        clubId: club.id,
        courtId: row.slot.courtId,
        date: row.slot.date,
        startTime: row.slot.startTime,
        endTime: row.slot.endTime,
      })
    }
    await prisma.seasonBooking.update({
      where: { id: season.id },
      data: { finishDate },
    })
    return {
      ok: true,
      action: 'shorten' as const,
      finishDate,
      cancelled: toCancel.length,
      created: 0,
      skipped: 0,
    }
  }

  // Past hours in the new window are soft-skipped by previewSeasonSessions (PAST).
  const rules = deriveSeasonRulesFromSlots(
    series.map((row) => ({
      date: row.slot.date,
      startTime: row.slot.startTime,
      endTime: row.slot.endTime,
      courtId: row.slot.courtId,
    })),
  )
  if (!rules.length) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot derive season schedule' })
  }

  const extendFrom = addDaysToIsoDate(currentEnd, 1)
  if (extendFrom > finishDate) {
    return { ok: true, action: 'noop' as const, finishDate, count: series.length }
  }

  const sessions = expandSeasonRules({
    startDate: extendFrom,
    finishDate,
    rules,
  })
  if (!sessions.length) {
    // No matching weekdays in the new window — still store the new finish.
    if (!body.dryRun) {
      await prisma.seasonBooking.update({
        where: { id: season.id },
        data: { finishDate },
      })
    }
    return {
      ok: true,
      action: 'extend' as const,
      finishDate,
      created: 0,
      skipped: 0,
      cancelCount: 0,
      createCount: 0,
      skipCount: 0,
    }
  }

  const preview = await previewSeasonSessions({ clubId: club.id, sessions })
  if (body.dryRun) {
    return {
      ok: true,
      action: 'extend' as const,
      finishDate,
      createCount: preview.willCreateCount,
      skipCount: preview.skippedCount,
      cancelCount: 0,
      totalAmount: preview.totalAmount,
    }
  }

  if (preview.willCreateCount === 0) {
    await prisma.seasonBooking.update({
      where: { id: season.id },
      data: { finishDate },
    })
    return {
      ok: true,
      action: 'extend' as const,
      finishDate,
      created: 0,
      skipped: preview.skippedCount,
    }
  }

  const result = await createSeasonSessions({
    clubId: club.id,
    sessions,
    guestName: season.guestName,
    guestFamily: season.guestFamily,
    guestMobile: season.guestMobile,
    comments: season.comments || undefined,
    paymentMethod: 'CASH',
    paymentStatus: 'PAY_AT_CLUB',
    existingSeasonBookingId: season.id,
  })

  // createSeasonSessions updates finishDate from created rows; force the requested end.
  await prisma.seasonBooking.update({
    where: { id: season.id },
    data: { finishDate },
  })

  return {
    ok: true,
    action: 'extend' as const,
    finishDate,
    created: result.slotsCreated,
    skipped: result.slotsSkipped,
  }
})
