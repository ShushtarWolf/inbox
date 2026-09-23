import { computeListedSlotPrice } from '#shared/courtPricing.ts'
import { initialPlatformPaymentFields, isOnlinePaymentsEnabled } from '#shared/bookingPayment.ts'
import { normalizeGuestNamePair } from '#shared/guestName.ts'
import { initialOnlineCourtHoldDisplay } from '#shared/onlinePaymentHold.ts'
import { canClaimExistingSlotForRecurring, type RecurringConflictRef } from '#shared/recurringReserve.ts'
import type { SeasonSessionOccurrence } from '#shared/seasonSessions.ts'
import { isSlotStartInPast } from '#shared/localDate.ts'
import { findUserByPhone } from './phoneAuth'
import { assignBookingPayPin } from './payPin'
import { payUrlForPin } from './receipt'
import { syncClubContactForBooking } from './contactSync'
import { formatHour, hourEnd, addMinutes, ensureSlotsForDate } from './slots'
import { hourFromTime } from './seasonSlots'
import { prisma } from './prisma'

export type SeasonPreviewItem = SeasonSessionOccurrence & {
  price: number
  endTime: string
}

export type SeasonConflictItem = RecurringConflictRef & {
  courtId: string
}

export type SeasonPreviewResult = {
  willCreate: SeasonPreviewItem[]
  willCreateCount: number
  conflicts: SeasonConflictItem[]
  skippedCount: number
  totalAmount: number
}

async function loadCourtMap(clubId: string, courtIds: string[]) {
  const unique = [...new Set(courtIds.filter(Boolean))]
  if (!unique.length) return new Map<string, never>()
  const courts = await prisma.court.findMany({
    where: { id: { in: unique }, clubId },
    include: { club: true },
  })
  return new Map(courts.map((c) => [c.id, c]))
}

/** Dry-run: classify each occurrence as free (with price) or conflict. Never blocks on conflicts. */
export async function previewSeasonSessions(opts: {
  clubId: string
  sessions: SeasonSessionOccurrence[]
}): Promise<SeasonPreviewResult> {
  const courtMap = await loadCourtMap(opts.clubId, opts.sessions.map((s) => s.courtId))
  const willCreate: SeasonPreviewItem[] = []
  const conflicts: SeasonConflictItem[] = []
  const seen = new Set<string>()

  for (const session of opts.sessions) {
    const key = `${session.courtId}|${session.date}|${session.startTime}`
    if (seen.has(key)) continue
    seen.add(key)

    const court = courtMap.get(session.courtId)
    if (!court) {
      conflicts.push({
        date: session.date,
        startTime: session.startTime,
        courtId: session.courtId,
        reason: 'OUTSIDE_HOURS',
      })
      continue
    }

    const hour = hourFromTime(session.startTime)
    const openHour = court.openHour ?? court.club.openHour
    const closeHour = court.closeHour ?? court.club.closeHour
    const startTime = formatHour(hour)
    const duration = court.club.defaultSessionDurationMinutes || 60
    const endTime = duration === 60 ? hourEnd(hour) : addMinutes(startTime, duration)

    if (hour < openHour || hour >= closeHour) {
      conflicts.push({ date: session.date, startTime, courtId: court.id, reason: 'OUTSIDE_HOURS' })
      continue
    }
    if (isSlotStartInPast(session.date, startTime)) {
      conflicts.push({ date: session.date, startTime, courtId: court.id, reason: 'PAST' })
      continue
    }

    await ensureSlotsForDate(opts.clubId, session.date)
    const existing = await prisma.slot.findFirst({
      where: { courtId: court.id, date: session.date, startTime, displayStatus: { not: 'CANCELLED' } },
      include: { booking: true },
    })
    if (!canClaimExistingSlotForRecurring(existing)) {
      conflicts.push({ date: session.date, startTime, courtId: court.id, reason: 'OCCUPIED' })
      continue
    }

    const price = computeListedSlotPrice(court.price, startTime, court.pricingJson)
    willCreate.push({ date: session.date, startTime, courtId: court.id, price, endTime })
  }

  const totalAmount = willCreate.reduce((sum, row) => sum + row.price, 0)
  return {
    willCreate,
    willCreateCount: willCreate.length,
    conflicts,
    skippedCount: conflicts.length,
    totalAmount,
  }
}

export type CreateSeasonSessionsOpts = {
  clubId: string
  sessions: SeasonSessionOccurrence[]
  guestName: string
  guestFamily: string
  guestMobile: string
  comments?: string
  paymentMethod: 'CASH' | 'IPG'
  paymentStatus: 'PAID' | 'PAY_AT_CLUB'
  /** Optional equipment rolled into primary payment only. */
  equipmentPrice?: number
  /**
   * `athlete` = PLATFORM source, soft hold, initialPlatformPaymentFields, checkout on primary.
   * Default `owner` keeps desk CASH/IPG + pay-pin behaviour.
   */
  mode?: 'owner' | 'athlete'
  /** Force booking.userId (athlete auth user). */
  forceUserId?: string
  actorUserId?: string
}

export type CreateSeasonSessionsResult = SeasonPreviewResult & {
  seasonBookingId: string
  bookingIds: string[]
  primaryBookingId: string | null
  payPin?: string
  payUrl?: string
  slotsCreated: number
  slotsSkipped: number
}

/**
 * Create season series from explicit sessions.
 * Conflicts are skipped (soft). One pay link covers the series when unpaid + online (owner).
 * Athlete mode: PLATFORM soft-hold + primary holds series total for checkout.
 */
export async function createSeasonSessions(opts: CreateSeasonSessionsOpts): Promise<CreateSeasonSessionsResult> {
  const athleteMode = opts.mode === 'athlete'
  const preview = await previewSeasonSessions({ clubId: opts.clubId, sessions: opts.sessions })
  if (preview.willCreateCount === 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'RECURRING_NO_FREE_SLOTS',
      data: { conflicts: preview.conflicts, skippedCount: preview.skippedCount },
    })
  }

  const guest = normalizeGuestNamePair(opts.guestName, opts.guestFamily)
  const linkedUser = opts.forceUserId
    ? await prisma.user.findUnique({ where: { id: opts.forceUserId } })
    : await findUserByPhone(opts.guestMobile)
  if (athleteMode && !opts.forceUserId) {
    throw createError({ statusCode: 400, statusMessage: 'forceUserId required for athlete season' })
  }
  if (athleteMode && !linkedUser) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }
  const guestNamePair = linkedUser?.name?.trim()
    ? normalizeGuestNamePair(linkedUser.name, '')
    : guest

  const days = [...new Set(preview.willCreate.map((s) => {
    const d = new Date(`${s.date}T12:00:00Z`).getUTCDay()
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d] || 'Sun'
  }))]
  const startDate = preview.willCreate[0]!.date
  const finishDate = preview.willCreate[preview.willCreate.length - 1]!.date

  const seasonRecord = await prisma.seasonBooking.create({
    data: {
      clubId: opts.clubId,
      guestName: guestNamePair.guestName,
      guestFamily: guestNamePair.guestFamily,
      guestMobile: opts.guestMobile || '',
      daysJson: JSON.stringify(days),
      timesJson: JSON.stringify(opts.sessions),
      startDate,
      finishDate,
      comments: opts.comments,
      equipmentPrice: opts.equipmentPrice || 0,
    },
  })

  const online = isOnlinePaymentsEnabled()
  const wantPayLink = !athleteMode && opts.paymentStatus !== 'PAID' && online
  const equipmentPrice = opts.equipmentPrice || 0
  const seriesTotal = preview.totalAmount + equipmentPrice
  const holdDisplay = athleteMode
    ? initialOnlineCourtHoldDisplay(online)
    : { displayStatus: 'RESERVED' as const, bookingStatus: 'CONFIRMED' as const }
  const eventSource = athleteMode ? 'athlete-season' : 'owner-recurring'

  const bookingIds: string[] = []
  let primaryBookingId: string | null = null
  /** Per-booking listed price for cancel pro-rata (index aligned with bookingIds push order). */
  const sessionPrices: number[] = []

  try {
    for (let i = 0; i < preview.willCreate.length; i++) {
      const row = preview.willCreate[i]!
      const isPrimary = i === 0
      await ensureSlotsForDate(opts.clubId, row.date)

      const court = await prisma.court.findFirst({
        where: { id: row.courtId, clubId: opts.clubId },
        include: { club: true },
      })
      if (!court) continue

      const existing = await prisma.slot.findFirst({
        where: {
          courtId: court.id,
          date: row.date,
          startTime: row.startTime,
          displayStatus: { not: 'CANCELLED' },
        },
        include: { booking: true },
      })
      if (!canClaimExistingSlotForRecurring(existing)) {
        preview.conflicts.push({
          date: row.date,
          startTime: row.startTime,
          courtId: court.id,
          reason: 'CLAIM_RACE',
        })
        continue
      }

      const sessionPrice = isPrimary ? row.price + equipmentPrice : row.price
      const amount = athleteMode || wantPayLink
        ? (isPrimary ? seriesTotal : 0)
        : sessionPrice

      const claimed = await prisma.$transaction(async (tx) => {
        let slotId: string
        if (existing) {
          const claimedRows = await tx.slot.updateMany({
            where: { id: existing.id, displayStatus: 'FREE' },
            data: { displayStatus: holdDisplay.displayStatus },
          })
          if (claimedRows.count !== 1) return null
          if (existing.booking?.status === 'CANCELLED') {
            await tx.booking.delete({ where: { id: existing.booking.id } })
          }
          slotId = existing.id
        }
        else {
          try {
            const slot = await tx.slot.create({
              data: {
                courtId: court.id,
                date: row.date,
                startTime: row.startTime,
                endTime: row.endTime,
                price: row.price,
                displayStatus: holdDisplay.displayStatus,
              },
            })
            slotId = slot.id
          }
          catch {
            return null
          }
        }

        if (athleteMode) {
          const paymentFields = initialPlatformPaymentFields(amount)
          const booking = await tx.booking.create({
            data: {
              slotId,
              userId: opts.forceUserId!,
              guestName: guestNamePair.guestName,
              guestFamily: guestNamePair.guestFamily,
              guestMobile: opts.guestMobile || '',
              comments: opts.comments,
              paymentStatus: paymentFields.paymentStatus,
              status: holdDisplay.bookingStatus,
              source: 'PLATFORM',
            },
          })

          await tx.payment.create({
            data: {
              bookingId: booking.id,
              ...paymentFields.payment,
              metadataJson: JSON.stringify({
                sessionPrice,
                seasonBookingId: seasonRecord.id,
                ...(amount === 0 ? { coveredBySeason: true } : {}),
              }),
            },
          })

          await tx.reservationEvent.create({
            data: {
              bookingId: booking.id,
              actorUserId: opts.actorUserId || opts.forceUserId,
              type: 'CREATED',
              metadataJson: JSON.stringify({
                source: eventSource,
                seasonBookingId: seasonRecord.id,
                sessionPrice,
                isPrimary,
              }),
            },
          })

          return booking.id
        }

        const booking = await tx.booking.create({
          data: {
            slotId,
            userId: linkedUser?.id || undefined,
            guestName: guestNamePair.guestName,
            guestFamily: guestNamePair.guestFamily,
            guestMobile: opts.guestMobile || '',
            comments: opts.comments,
            paymentMethod: opts.paymentMethod,
            paymentStatus: opts.paymentStatus,
            status: 'CONFIRMED',
            source: 'CLUB',
          },
        })

        await tx.payment.create({
          data: {
            bookingId: booking.id,
            amount,
            method: opts.paymentMethod,
            status: opts.paymentStatus,
            provider: opts.paymentMethod === 'IPG' ? 'sep' : 'pay_at_club',
            metadataJson: JSON.stringify({
              sessionPrice,
              ...(wantPayLink && !isPrimary ? { coveredBySeason: true } : {}),
            }),
          },
        })

        await tx.reservationEvent.create({
          data: {
            bookingId: booking.id,
            actorUserId: opts.actorUserId,
            type: 'CREATED',
            metadataJson: JSON.stringify({
              source: eventSource,
              seasonBookingId: seasonRecord.id,
              sessionPrice,
              isPrimary,
            }),
          },
        })

        return booking.id
      })

      if (!claimed) {
        preview.conflicts.push({
          date: row.date,
          startTime: row.startTime,
          courtId: court.id,
          reason: 'CLAIM_RACE',
        })
        continue
      }

      bookingIds.push(claimed)
      sessionPrices.push(sessionPrice)
      if (isPrimary) primaryBookingId = claimed
      await syncClubContactForBooking(claimed)
    }
  }
  catch (error) {
    await prisma.seasonBooking.delete({ where: { id: seasonRecord.id } }).catch(() => {})
    throw error
  }

  if (!bookingIds.length) {
    await prisma.seasonBooking.delete({ where: { id: seasonRecord.id } }).catch(() => {})
    throw createError({
      statusCode: 409,
      statusMessage: 'RECURRING_NO_FREE_SLOTS',
      data: { conflicts: preview.conflicts, skippedCount: preview.conflicts.length },
    })
  }

  // Wire series pay sync: primary payment covers siblings.
  if (primaryBookingId && bookingIds.length > 1) {
    const siblingIds = bookingIds.slice(1)
    const primaryPayment = await prisma.payment.findUnique({ where: { bookingId: primaryBookingId } })
    if (primaryPayment) {
      let existingMeta: Record<string, unknown> = {}
      if (primaryPayment.metadataJson) {
        try {
          existingMeta = JSON.parse(primaryPayment.metadataJson) as Record<string, unknown>
        }
        catch {
          existingMeta = {}
        }
      }
      await prisma.payment.update({
        where: { id: primaryPayment.id },
        data: {
          metadataJson: JSON.stringify({
            ...existingMeta,
            sessionPrice: sessionPrices[0],
            seasonBookingId: seasonRecord.id,
            groupPrimaryBookingId: primaryBookingId,
            groupSiblingBookingIds: siblingIds,
          }),
        },
      })
      for (let i = 0; i < siblingIds.length; i++) {
        const siblingId = siblingIds[i]!
        await prisma.payment.updateMany({
          where: { bookingId: siblingId },
          data: {
            metadataJson: JSON.stringify({
              coveredByBookingId: primaryBookingId,
              seasonBookingId: seasonRecord.id,
              sessionPrice: sessionPrices[i + 1],
            }),
          },
        })
      }
    }
  }
  else if (primaryBookingId && bookingIds.length === 1) {
    const primaryPayment = await prisma.payment.findUnique({ where: { bookingId: primaryBookingId } })
    if (primaryPayment) {
      let existingMeta: Record<string, unknown> = {}
      if (primaryPayment.metadataJson) {
        try {
          existingMeta = JSON.parse(primaryPayment.metadataJson) as Record<string, unknown>
        }
        catch {
          existingMeta = {}
        }
      }
      await prisma.payment.update({
        where: { id: primaryPayment.id },
        data: {
          metadataJson: JSON.stringify({
            ...existingMeta,
            sessionPrice: sessionPrices[0],
            seasonBookingId: seasonRecord.id,
            groupPrimaryBookingId: primaryBookingId,
          }),
        },
      })
    }
  }

  let payPin: string | undefined
  let payUrl: string | undefined
  if (wantPayLink && primaryBookingId) {
    payPin = await assignBookingPayPin(primaryBookingId)
    payUrl = payUrlForPin(payPin)
  }

  return {
    ...preview,
    willCreateCount: bookingIds.length,
    skippedCount: preview.conflicts.length,
    seasonBookingId: seasonRecord.id,
    bookingIds,
    primaryBookingId,
    payPin,
    payUrl,
    slotsCreated: bookingIds.length,
    slotsSkipped: preview.conflicts.length,
    totalAmount: seriesTotal,
  }
}
