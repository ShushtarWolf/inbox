/**
 * Diff-based owner season edit (replaces cancel-all-and-recreate).
 *
 * Old live bookings and new form occurrences are reduced to atomic (court, date, hour) units:
 *  - unchanged → booking untouched (no refund, no re-charge, payment status preserved)
 *  - added     → created after a conflict check against other bookings (whole edit rejected on conflict)
 *  - removed   → cancelled with the normal refund rules (online-paid → athlete wallet once;
 *                cash → desk cash-return only, never a wallet)
 *  - past      → never touched
 * Everything runs in one transaction, serialized per season with a row lock, so a retry after a
 * commit sees a zero diff and a failed attempt writes nothing.
 */
import type { Prisma } from '@prisma/client'
import { createError } from 'h3'
import { computeListedSlotPrice } from '#shared/courtPricing.ts'
import { isSlotStartInPast } from '#shared/localDate.ts'
import { normalizeGuestNamePair } from '#shared/guestName.ts'
import { userToGuestNamePair } from '#shared/userName.ts'
import { seriesCancelPaymentId } from '#shared/ownerSeries.ts'
import { canClaimExistingSlotForRecurring } from '#shared/recurringReserve.ts'
import { IRAN_WEEKDAY_ORDER, weekdayNameFromDate } from '#shared/recurringSessions.ts'
import {
  aggregateSeasonUnits,
  diffSeasonUnits,
  seasonEditHasChanges,
  uniqueSeasonUnits,
  type ExistingSeasonUnit,
  type SeasonUnit,
  type SeasonUnitRange,
} from '#shared/seasonEditDiff.ts'
import { cancelCourtBooking } from './cancellations'
import { syncClubContactForBooking } from './contactSync'
import { loadOwnerSeriesBookingsBySeasonId } from './ownerSeriesCancel'
import { findUserByPhone } from './phoneAuth'
import { prisma } from './prisma'
import { hourFromTime } from './seasonSlots'
import { bookingLooksLikeSeriesPayment, loadSeriesGroupForBooking, refundAfterSeriesSessionCancel } from './seriesCancelRefund'
import { addMinutes, ensureSlotsForDate, formatHour, hourEnd } from './slots'
import { deleteStaleCancelledBooking } from './staleBooking'

type Tx = Prisma.TransactionClient
type LiveRow = Awaited<ReturnType<typeof loadOwnerSeriesBookingsBySeasonId>>[number]

export type SeasonEditConflict = { date: string; startTime: string; courtId: string; reason: 'OCCUPIED' | 'OUTSIDE_HOURS' }

export type SeasonEditSummary = {
  seasonBookingId: string
  unchanged: number
  added: number
  removed: number
  keptPast: number
  addedAmount: number
  /** Credited to athlete wallets (online-paid hours removed). */
  refundTotal: number
  /** Cash hours removed — recorded for desk cash-return only, never a wallet. */
  cashReturnTotal: number
  addedBookingIds: string[]
  removedBookingIds: string[]
  addedRanges: SeasonUnitRange[]
  removedRanges: SeasonUnitRange[]
  /** Added units with price/end time (for notifications). */
  addedUnits: Array<SeasonUnit & { endTime: string; price: number }>
  changed: boolean
}

function toExistingUnits(rows: LiveRow[], now?: Date): ExistingSeasonUnit<LiveRow>[] {
  return rows.map((row) => ({
    date: row.slot.date,
    startTime: row.slot.startTime,
    courtId: row.slot.courtId,
    bookingId: row.id,
    past: isSlotStartInPast(row.slot.date, row.slot.startTime, now),
    ref: row,
  }))
}

function daysJsonFor(units: SeasonUnit[]): string {
  const order = new Map(IRAN_WEEKDAY_ORDER.map((d, i) => [d as string, i]))
  const days = [...new Set(units.map((u) => weekdayNameFromDate(u.date)))]
    .sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99))
  return JSON.stringify(days)
}

/** Read-only diff for the edit preview (no writes). */
export async function previewSeasonEditDiff(opts: {
  clubId: string
  seasonBookingId: string
  sessions: SeasonUnit[]
  now?: Date
}) {
  const rows = await loadOwnerSeriesBookingsBySeasonId(opts.clubId, opts.seasonBookingId)
  const diff = diffSeasonUnits({
    existing: toExistingUnits(rows, opts.now),
    desired: opts.sessions,
    isPast: (u) => isSlotStartInPast(u.date, u.startTime, opts.now),
  })
  return {
    unchanged: diff.unchanged.length,
    added: diff.added.length,
    removed: diff.removed.length,
    keptPast: diff.keptPast.length,
    addedRanges: aggregateSeasonUnits(diff.added),
    removedRanges: aggregateSeasonUnits(diff.removed),
  }
}

export async function applySeasonEdit(opts: {
  clubId: string
  seasonBookingId: string
  /** Desired occurrences from the form (already expanded; duplicates/overlaps allowed). */
  sessions: SeasonUnit[]
  guestName: string
  guestFamily: string
  guestMobile: string
  comments?: string | null
  startDate: string
  finishDate: string
  /** Payment for newly added hours only. Kept hours keep their own payment. */
  paymentMethod: 'CASH' | 'IPG'
  paymentStatus: 'PAID' | 'PAY_AT_CLUB'
  actorUserId?: string
  now?: Date
}): Promise<SeasonEditSummary> {
  const seasonId = opts.seasonBookingId
  const season = await prisma.seasonBooking.findFirst({ where: { id: seasonId, clubId: opts.clubId } })
  if (!season) throw createError({ statusCode: 404, statusMessage: 'Season not found' })
  if (season.cancelledAt) throw createError({ statusCode: 400, statusMessage: 'Cannot edit a cancelled season' })

  const desired = uniqueSeasonUnits(opts.sessions)
  const isPast = (u: SeasonUnit) => isSlotStartInPast(u.date, u.startTime, opts.now)

  // Preliminary diff (outside txn) only to pre-create FREE slot rows for dates we may add to.
  const preRows = await loadOwnerSeriesBookingsBySeasonId(opts.clubId, seasonId)
  const preDiff = diffSeasonUnits({ existing: toExistingUnits(preRows, opts.now), desired, isPast })
  for (const date of [...new Set(preDiff.added.map((u) => u.date))]) {
    await ensureSlotsForDate(opts.clubId, date)
  }

  const guest = normalizeGuestNamePair(opts.guestName, opts.guestFamily)
  const linkedUser = await findUserByPhone(opts.guestMobile)
  const guestPair = linkedUser?.name?.trim() ? userToGuestNamePair(linkedUser) : guest
  const courts = await prisma.court.findMany({
    where: { clubId: opts.clubId, id: { in: [...new Set(desired.map((u) => u.courtId))] } },
    include: { club: true },
  })
  const courtById = new Map(courts.map((c) => [c.id, c]))

  const paymentsToSync = new Set<string>()
  const seriesBookingsToSync: string[] = []

  const summary = await prisma.$transaction(async (tx: Tx) => {
    // Serialize concurrent edits/retries of the same season.
    await tx.$executeRaw`SELECT id FROM "SeasonBooking" WHERE id = ${seasonId} FOR UPDATE`

    const rows = await loadOwnerSeriesBookingsBySeasonId(opts.clubId, seasonId, tx)
    const diff = diffSeasonUnits({ existing: toExistingUnits(rows, opts.now), desired, isPast })

    // 1) Validate every added unit before any write (reject the whole edit on conflict).
    const conflicts: SeasonEditConflict[] = []
    const plans: Array<{
      unit: SeasonUnit
      courtId: string
      startTime: string
      endTime: string
      price: number
      existingSlot: { id: string; booking: { id: string; status: string } | null } | null
    }> = []
    for (const unit of diff.added) {
      const court = courtById.get(unit.courtId)
      const hour = hourFromTime(unit.startTime)
      const startTime = formatHour(hour)
      if (!court) {
        conflicts.push({ date: unit.date, startTime, courtId: unit.courtId, reason: 'OUTSIDE_HOURS' })
        continue
      }
      const openHour = court.openHour ?? court.club.openHour
      const closeHour = court.closeHour ?? court.club.closeHour
      if (hour < openHour || hour >= closeHour) {
        conflicts.push({ date: unit.date, startTime, courtId: court.id, reason: 'OUTSIDE_HOURS' })
        continue
      }
      const duration = court.club.defaultSessionDurationMinutes || 60
      const endTime = duration === 60 ? hourEnd(hour) : addMinutes(startTime, duration)
      const slot = await tx.slot.findFirst({
        where: { courtId: court.id, date: unit.date, startTime, displayStatus: { not: 'CANCELLED' } },
        include: {
          booking: {
            select: {
              id: true,
              status: true,
              payment: { select: { metadataJson: true } },
              events: { where: { type: 'CREATED' }, take: 4, orderBy: { createdAt: 'desc' }, select: { metadataJson: true } },
            },
          },
        },
      })
      // No ignore-season exemption: an added unit is by definition not held by this season.
      if (!canClaimExistingSlotForRecurring(slot)) {
        conflicts.push({ date: unit.date, startTime, courtId: court.id, reason: 'OCCUPIED' })
        continue
      }
      plans.push({
        unit,
        courtId: court.id,
        startTime,
        endTime,
        price: computeListedSlotPrice(court.price, startTime, court.pricingJson),
        existingSlot: slot ? { id: slot.id, booking: slot.booking ? { id: slot.booking.id, status: slot.booking.status } : null } : null,
      })
    }
    if (conflicts.length) {
      throw createError({
        statusCode: 409,
        statusMessage: 'SEASON_EDIT_CONFLICT',
        data: { conflicts, conflictRanges: aggregateSeasonUnits(conflicts) },
      })
    }

    // 2) Cancel removed future units with the normal refund rules.
    let refundTotal = 0
    let cashReturnTotal = 0
    const tally = (r: { amount?: number; walletCredited?: boolean } | null | undefined) => {
      if (!r?.amount) return
      if (r.walletCredited) refundTotal += r.amount
      else cashReturnTotal += r.amount
    }
    const reason = 'owner-season-edit'
    for (const removed of diff.removed) {
      const row = removed.ref!
      if (bookingLooksLikeSeriesPayment(row.payment?.metadataJson)) {
        const refund = await refundAfterSeriesSessionCancel({
          cancelledBookingId: row.id,
          userId: row.userId,
          reason,
          moneyOutcome: 'full_wallet_refund',
          db: tx,
        })
        tally(refund)
        await cancelCourtBooking({
          bookingId: row.id,
          slotId: row.slotId,
          actorUserId: opts.actorUserId,
          reason,
          paymentId: null,
          userId: row.userId,
          moneyOutcome: 'zero_refund',
          db: tx,
        })
        seriesBookingsToSync.push(row.id)
      }
      else {
        const paymentId = seriesCancelPaymentId(row.payment)
        const result = await cancelCourtBooking({
          bookingId: row.id,
          slotId: row.slotId,
          actorUserId: opts.actorUserId,
          reason,
          paymentId,
          userId: row.userId,
          moneyOutcome: 'full_wallet_refund',
          db: tx,
        })
        tally(result.refund)
        if (paymentId && result.refund?.refunded) paymentsToSync.add(paymentId)
      }
    }

    // 3) Create added units (standalone desk bookings at listed price; no series pay link).
    const addedBookingIds: string[] = []
    for (const plan of plans) {
      let slotId: string
      if (plan.existingSlot) {
        const claimed = await tx.slot.updateMany({
          where: { id: plan.existingSlot.id, displayStatus: 'FREE' },
          data: { displayStatus: 'RESERVED' },
        })
        if (claimed.count !== 1) {
          throw createError({
            statusCode: 409,
            statusMessage: 'SEASON_EDIT_CONFLICT',
            data: { conflicts: [{ date: plan.unit.date, startTime: plan.startTime, courtId: plan.courtId, reason: 'OCCUPIED' }] },
          })
        }
        if (plan.existingSlot.booking?.status === 'CANCELLED') {
          await deleteStaleCancelledBooking(tx, plan.existingSlot.booking.id)
        }
        slotId = plan.existingSlot.id
      }
      else {
        const slot = await tx.slot.create({
          data: {
            courtId: plan.courtId,
            date: plan.unit.date,
            startTime: plan.startTime,
            endTime: plan.endTime,
            price: plan.price,
            displayStatus: 'RESERVED',
          },
        })
        slotId = slot.id
      }
      const booking = await tx.booking.create({
        data: {
          slotId,
          userId: linkedUser?.id || undefined,
          guestName: guestPair.guestName,
          guestFamily: guestPair.guestFamily,
          guestMobile: opts.guestMobile || '',
          comments: opts.comments ?? undefined,
          paymentMethod: opts.paymentMethod,
          paymentStatus: opts.paymentStatus,
          status: 'CONFIRMED',
          source: 'CLUB',
        },
      })
      await tx.payment.create({
        data: {
          bookingId: booking.id,
          amount: plan.price,
          method: opts.paymentMethod,
          status: opts.paymentStatus,
          provider: opts.paymentMethod === 'IPG' ? 'sep' : 'pay_at_club',
          metadataJson: JSON.stringify({ sessionPrice: plan.price, seasonBookingId: seasonId, seasonEditAdded: true }),
        },
      })
      await tx.reservationEvent.create({
        data: {
          bookingId: booking.id,
          actorUserId: opts.actorUserId,
          type: 'CREATED',
          metadataJson: JSON.stringify({
            source: 'owner-recurring',
            seasonBookingId: seasonId,
            sessionPrice: plan.price,
            isPrimary: false,
            appended: true,
            seasonEdit: true,
          }),
        },
      })
      addedBookingIds.push(booking.id)
    }

    // 4) Season definition: only write when something actually changed.
    const changed = seasonEditHasChanges(diff)
    // Stored definition = what the season now covers (kept past hours + the edited future).
    const covered = uniqueSeasonUnits([...desired, ...diff.keptPast])
    const nextTimes = JSON.stringify(covered.map((u) => ({ date: u.date, startTime: u.startTime, courtId: u.courtId })))
    const headerChanged = season.guestName !== guestPair.guestName
      || season.guestFamily !== guestPair.guestFamily
      || (season.guestMobile || '') !== (opts.guestMobile || '')
      || (season.comments ?? null) !== (opts.comments ?? null)
      || season.startDate !== opts.startDate
      || season.finishDate !== opts.finishDate
    // Unchanged edit (same hours, same header) writes nothing at all.
    if (changed || headerChanged) {
      await tx.seasonBooking.update({
        where: { id: seasonId },
        data: {
          guestName: guestPair.guestName,
          guestFamily: guestPair.guestFamily,
          guestMobile: opts.guestMobile || '',
          comments: opts.comments ?? null,
          startDate: opts.startDate,
          finishDate: opts.finishDate,
          daysJson: daysJsonFor(covered),
          timesJson: nextTimes,
        },
      })
    }

    return {
      seasonBookingId: seasonId,
      unchanged: diff.unchanged.length,
      added: plans.length,
      removed: diff.removed.length,
      keptPast: diff.keptPast.length,
      addedAmount: plans.reduce((sum, p) => sum + p.price, 0),
      refundTotal,
      cashReturnTotal,
      addedBookingIds,
      removedBookingIds: diff.removed.map((r) => r.bookingId),
      addedRanges: aggregateSeasonUnits(plans.map((p) => ({ ...p.unit, startTime: p.startTime }))),
      removedRanges: aggregateSeasonUnits(diff.removed),
      addedUnits: plans.map((p) => ({ date: p.unit.date, startTime: p.startTime, courtId: p.courtId, endTime: p.endTime, price: p.price })),
      changed,
    }
  }, { timeout: 60_000, maxWait: 10_000 })

  // After commit: parent payment sync + CRM contact sync (same as the single-cancel paths).
  const { syncPaymentToParent } = await import('./paymentSync')
  for (const bookingId of seriesBookingsToSync) {
    try {
      const loaded = await loadSeriesGroupForBooking(bookingId)
      if (loaded) paymentsToSync.add(loaded.primaryPayment.id)
    }
    catch (err) {
      console.error('[applySeasonEdit:seriesGroup]', bookingId, err)
    }
  }
  for (const paymentId of paymentsToSync) {
    try {
      await syncPaymentToParent(paymentId)
    }
    catch (err) {
      console.error('[applySeasonEdit:syncParent]', paymentId, err)
    }
  }
  for (const bookingId of [...summary.addedBookingIds, ...summary.removedBookingIds]) {
    await syncClubContactForBooking(bookingId).catch((err) => console.error('[applySeasonEdit:contact]', bookingId, err))
  }
  return summary
}

