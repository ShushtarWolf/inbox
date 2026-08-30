import { datesForWeekdays, datesForWeekdaysInRange, hourFromTime } from './seasonSlots'
import { weekdayNameFromDate } from '#shared/recurringSessions.ts'
import { computeListedSlotPrice } from '#shared/courtPricing.ts'
import {
  canClaimExistingSlotForRecurring,
  type RecurringConflictReason,
} from '#shared/recurringReserve.ts'
import { normalizeGuestNamePair } from '#shared/guestName.ts'
import { formatHour, hourEnd, addMinutes } from './slots'
import { isSlotStartInPast } from '#shared/localDate.ts'
import { calculateSessionTotal, syncBookingEquipments } from './bookingTotal'
import { syncClubContactForBooking } from './contactSync'
import { findUserByPhone } from './phoneAuth'

export type RecurringGuestInfo = {
  guestName: string
  guestFamily: string
  guestMobile: string
  comments?: string
  paymentMethod?: 'IPG' | 'CASH'
  paymentStatus?: 'PAID' | 'PAY_AT_CLUB'
  coachId?: string
  coachSessionPrice?: number
  equipmentId?: string
  equipmentPrice?: number
}

export type RecurringConflict = {
  date: string
  startTime: string
  reason: RecurringConflictReason
}

export type RecurringGenerateResult = {
  created: number
  skipped: number
  willCreate: Array<{ date: string; startTime: string }>
  conflicts: RecurringConflict[]
}

type GenerateOpts = {
  clubId: string
  courtId: string
  anchorDate: string
  weekdays: string[]
  times?: string[]
  dayTimes?: Record<string, string[]>
  weeks?: number
  startDate?: string
  finishDate?: string
  displayStatus?: 'RESERVED' | 'TEAM' | 'PENDING'
  guestInfo?: RecurringGuestInfo
  /** When true, inspect only — no slot/booking writes. */
  dryRun?: boolean
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && (error as { code?: string }).code === 'P2002',
  )
}

export async function generateRecurringCourtSlots(opts: GenerateOpts): Promise<RecurringGenerateResult> {
  const court = await prisma.court.findFirst({
    where: { id: opts.courtId, clubId: opts.clubId },
    include: { club: true },
  })
  if (!court) throw createError({ statusCode: 404, statusMessage: 'Court not found' })

  const dates = opts.startDate && opts.finishDate
    ? datesForWeekdaysInRange(opts.startDate, opts.finishDate, opts.weekdays)
    : datesForWeekdays(opts.anchorDate, opts.weekdays, opts.weeks ?? 8)
  const status = opts.displayStatus ?? 'RESERVED'
  const guest = opts.guestInfo
    ? { ...opts.guestInfo, ...normalizeGuestNamePair(opts.guestInfo.guestName, opts.guestInfo.guestFamily) }
    : undefined
  const paymentMethod = guest?.paymentMethod || 'CASH'
  const paymentStatus = guest?.paymentStatus || 'PAY_AT_CLUB'
  const equipmentItems = guest?.equipmentId
    ? await prisma.equipment.findMany({
        where: { id: guest.equipmentId, clubId: opts.clubId },
        select: { id: true, price: true, category: true, quantity: true },
      })
    : []
  const equipmentBookingItems = equipmentItems.map((item) => ({
    ...item,
    quantity: 1,
  }))
  let created = 0
  let skipped = 0
  const willCreate: Array<{ date: string; startTime: string }> = []
  const conflicts: RecurringConflict[] = []

  for (const date of dates) {
    await ensureSlotsForDate(opts.clubId, date)
    const weekday = weekdayNameFromDate(date)
    const timesForDate = opts.dayTimes?.[weekday] ?? opts.times ?? []
    for (const time of timesForDate) {
      const hour = hourFromTime(time)
      const openHour = court.openHour ?? court.club.openHour
      const closeHour = court.closeHour ?? court.club.closeHour
      if (hour < openHour || hour >= closeHour) {
        skipped += 1
        conflicts.push({ date, startTime: formatHour(hour), reason: 'OUTSIDE_HOURS' })
        continue
      }
      const startTime = formatHour(hour)
      if (isSlotStartInPast(date, startTime)) {
        skipped += 1
        conflicts.push({ date, startTime, reason: 'PAST' })
        continue
      }
      const duration = court.club.defaultSessionDurationMinutes || 60
      const endTime = duration === 60 ? hourEnd(hour) : addMinutes(startTime, duration)
      const slotPrice = computeListedSlotPrice(court.price, startTime, court.pricingJson)
      const sessionAmount = guest
        ? calculateSessionTotal({
            courtPrice: slotPrice,
            equipmentPrices: guest.equipmentPrice ? [guest.equipmentPrice] : [],
            coachPrice: guest.coachSessionPrice || 0,
          })
        : slotPrice
      const existing = await prisma.slot.findFirst({
        where: { courtId: court.id, date, startTime, displayStatus: { not: 'CANCELLED' } },
        include: { booking: true },
      })

      // Never overwrite PLATFORM/live bookings or non-FREE desk holds.
      if (!canClaimExistingSlotForRecurring(existing)) {
        skipped += 1
        conflicts.push({ date, startTime, reason: 'OCCUPIED' })
        continue
      }

      if (opts.dryRun) {
        willCreate.push({ date, startTime })
        created += 1
        continue
      }

      try {
        const linkedUser = guest ? await findUserByPhone(guest.guestMobile) : null
        const claimed = await prisma.$transaction(async (tx) => {
          let slotId: string
          let staleCancelledId: string | null = null

          if (existing) {
            const fresh = await tx.slot.findFirst({
              where: { id: existing.id },
              include: { booking: true },
            })
            if (!canClaimExistingSlotForRecurring(fresh)) return null
            // Atomic FREE claim — loses the race if another writer took the slot.
            const claimedRows = await tx.slot.updateMany({
              where: { id: existing.id, displayStatus: 'FREE' },
              data: { displayStatus: status },
            })
            if (claimedRows.count !== 1) return null
            slotId = existing.id
            if (fresh?.booking?.status === 'CANCELLED') staleCancelledId = fresh.booking.id
            const liveBooking = await tx.booking.findFirst({
              where: { slotId, status: { not: 'CANCELLED' } },
            })
            if (liveBooking) {
              await tx.slot.update({ where: { id: slotId }, data: { displayStatus: 'FREE' } })
              return null
            }
          } else {
            try {
              const slot = await tx.slot.create({
                data: {
                  courtId: court.id,
                  date,
                  startTime,
                  endTime,
                  price: slotPrice,
                  displayStatus: status,
                },
              })
              slotId = slot.id
            } catch (error) {
              if (isUniqueViolation(error)) return null
              throw error
            }
          }

          if (!guest) return { slotId, bookingId: null as string | null }

          if (staleCancelledId) {
            await tx.booking.delete({ where: { id: staleCancelledId } })
          }
          const linkedUserId = linkedUser?.id ?? null
          const guestNamePair = linkedUser?.name?.trim()
            ? normalizeGuestNamePair(linkedUser.name, '')
            : { guestName: guest.guestName, guestFamily: guest.guestFamily }
          const booking = await tx.booking.create({
            data: {
              slotId,
              userId: linkedUserId || undefined,
              guestName: guestNamePair.guestName,
              guestFamily: guestNamePair.guestFamily,
              guestMobile: guest.guestMobile,
              comments: guest.comments,
              coachId: guest.coachId || null,
              paymentMethod,
              paymentStatus,
              status: 'CONFIRMED',
              source: 'CLUB',
            },
          })
          await syncBookingEquipments(tx, booking.id, equipmentBookingItems)
          await tx.payment.create({
            data: {
              bookingId: booking.id,
              amount: sessionAmount,
              method: paymentMethod,
              status: paymentStatus,
            },
          })
          await tx.reservationEvent.create({
            data: {
              bookingId: booking.id,
              type: 'CREATED',
              metadataJson: JSON.stringify({ source: 'owner-recurring' }),
            },
          })
          return { slotId, bookingId: booking.id }
        })

        if (!claimed) {
          skipped += 1
          conflicts.push({ date, startTime, reason: 'CLAIM_RACE' })
          continue
        }

        if (claimed.bookingId) {
          await syncClubContactForBooking(claimed.bookingId)
        }
        willCreate.push({ date, startTime })
        created += 1
      } catch (error) {
        if (isUniqueViolation(error)) {
          skipped += 1
          conflicts.push({ date, startTime, reason: 'CLAIM_RACE' })
          continue
        }
        throw error
      }
    }
  }
  return { created, skipped, willCreate, conflicts }
}
