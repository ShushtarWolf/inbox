import { normalizeGuestNamePair } from '#shared/guestName.ts'
import { expandDayTimeRanges, type DayTimeRange } from '#shared/recurringSessions.ts'
import { notifyBookingConfirmed, clubNotifyName, clubNotifyLocation, personNotifyName } from '../../utils/bookingNotify'
import { generateRecurringCourtSlots } from '../../utils/generateRecurringSlots'
import {
  loadEquipmentForBooking,
  parseEquipmentSelections,
  sumEquipmentPrices,
} from '../../utils/bookingTotal'
import { assertRecurringReserveEnabled } from '../../utils/recurringReserveGate'
import { assertPackagesEnabled } from '../../utils/packagesGate'
import { assertDateNotInPast } from '../../utils/reservations'

function resolveDayTimes(
  dayTimes?: Record<string, DayTimeRange>,
  times?: string[],
  days?: string[],
): { storedJson: string; expanded: Record<string, string[]> } {
  if (dayTimes && Object.keys(dayTimes).length) {
    const expanded = expandDayTimeRanges(dayTimes)
    return { storedJson: JSON.stringify(dayTimes), expanded }
  }
  if (times?.length && days?.length) {
    const lastTime = times[times.length - 1]
    const firstTime = times[0]
    if (!lastTime || !firstTime) {
      return { storedJson: JSON.stringify(dayTimes || times || []), expanded: {} }
    }
    const endHour = Number.parseInt(lastTime.slice(0, 2), 10) + 1
    const legacyRange = { start: firstTime, end: `${String(endHour).padStart(2, '0')}:00` }
    const mapped = Object.fromEntries(days.map((day) => [day, legacyRange])) as Record<string, DayTimeRange>
    return { storedJson: JSON.stringify(mapped), expanded: expandDayTimeRanges(mapped) }
  }
  return { storedJson: JSON.stringify(dayTimes || times || []), expanded: {} }
}

function firstScheduleTime(expanded: Record<string, string[]>, times?: string[]): string {
  if (times?.length) return times[0] ?? ''
  for (const dayTimes of Object.values(expanded)) {
    if (dayTimes?.length) return dayTimes[0] ?? ''
  }
  return ''
}

/** Recurring unpaid has no series pay link — always desk cash unpaid. */
function resolveRecurringPayment(body: {
  paymentMethod?: string
  paymentStatus?: string
}): { paymentMethod: 'CASH'; paymentStatus: 'PAID' | 'PAY_AT_CLUB' } {
  const paid = body.paymentStatus === 'PAID'
  return {
    paymentMethod: 'CASH',
    paymentStatus: paid ? 'PAID' : 'PAY_AT_CLUB',
  }
}

export default defineEventHandler(async (event) => {
  assertPackagesEnabled(event)
  assertRecurringReserveEnabled(event)
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{
    guestName?: string
    guestFamily?: string
    guestMobile?: string
    coachId?: string
    days?: string[]
    times?: string[]
    dayTimes?: Record<string, DayTimeRange>
    startDate?: string
    finishDate?: string
    comments?: string
    slotId?: string
    equipmentId?: string
    equipmentIds?: string[]
    equipmentQuantities?: Record<string, number>
    paymentMethod?: string
    paymentStatus?: string
    /** Ignored — conflicts are always soft-skipped. Kept for older clients. */
    acceptSkips?: boolean
  }>(event)

  if (!body.startDate || !body.finishDate) {
    throw createError({ statusCode: 400, statusMessage: 'Start and finish dates are required' })
  }
  if (body.finishDate < body.startDate) {
    throw createError({ statusCode: 400, statusMessage: 'Finish date must be on or after start date' })
  }
  assertDateNotInPast(body.startDate)

  const equipmentSelections = parseEquipmentSelections(
    body.equipmentIds?.length ? body.equipmentIds : (body.equipmentId ? [body.equipmentId] : []),
    body.equipmentQuantities,
  )
  const equipmentItems = await loadEquipmentForBooking(club.id, equipmentSelections)
  if (equipmentSelections.length && equipmentItems.length !== equipmentSelections.length) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid equipment' })
  }
  const equipmentPrice = sumEquipmentPrices(equipmentItems)
  const equipmentQuantities = Object.fromEntries(
    equipmentItems.map((item) => [item.id, item.quantity]),
  )

  let coachSessionPrice = 0
  if (body.coachId) {
    const coach = await prisma.coach.findFirst({
      where: { id: body.coachId, approvalStatus: 'APPROVED' },
    })
    if (coach) coachSessionPrice = coach.sessionPrice
  }

  const { storedJson, expanded } = resolveDayTimes(body.dayTimes, body.times, body.days)
  const guest = normalizeGuestNamePair(body.guestName, body.guestFamily)
  const hasSchedule = Boolean(body.days?.length && Object.keys(expanded).length)

  if (!body.slotId || !hasSchedule) {
    throw createError({ statusCode: 400, statusMessage: 'slotId and schedule are required' })
  }

  const slot = await prisma.slot.findFirst({
    where: { id: body.slotId, court: { clubId: club.id } },
  })
  if (!slot) throw createError({ statusCode: 404, statusMessage: 'Slot not found' })

  const preview = await generateRecurringCourtSlots({
    clubId: club.id,
    courtId: slot.courtId,
    anchorDate: body.startDate,
    weekdays: body.days!,
    dayTimes: expanded,
    startDate: body.startDate,
    finishDate: body.finishDate,
    displayStatus: 'TEAM',
    dryRun: true,
  })

  if (preview.created === 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'RECURRING_NO_FREE_SLOTS',
      data: { conflicts: preview.conflicts, skippedCount: preview.skipped },
    })
  }
  // Conflicts are soft-skipped (same as season) — occupied slots stay untouched.

  const { paymentMethod, paymentStatus } = resolveRecurringPayment(body)

  const record = await prisma.seasonBooking.create({
    data: {
      clubId: club.id,
      guestName: guest.guestName,
      guestFamily: guest.guestFamily,
      guestMobile: body.guestMobile || '',
      daysJson: JSON.stringify(body.days || []),
      timesJson: storedJson,
      startDate: body.startDate,
      finishDate: body.finishDate,
      comments: body.comments,
      coachId: body.coachId || null,
      equipmentId: equipmentItems[0]?.id || null,
      equipmentPrice,
    },
  })

  const result = await generateRecurringCourtSlots({
    clubId: club.id,
    courtId: slot.courtId,
    anchorDate: body.startDate,
    weekdays: body.days!,
    dayTimes: expanded,
    startDate: body.startDate,
    finishDate: body.finishDate,
    displayStatus: 'TEAM',
    guestInfo: {
      guestName: guest.guestName,
      guestFamily: guest.guestFamily,
      guestMobile: body.guestMobile || '',
      comments: body.comments,
      coachId: body.coachId,
      coachSessionPrice,
      equipmentIds: equipmentItems.map((item) => item.id),
      equipmentQuantities,
      equipmentPrice,
      paymentMethod,
      paymentStatus,
    },
  })

  if (result.created === 0) {
    await prisma.seasonBooking.delete({ where: { id: record.id } }).catch(() => {})
    throw createError({
      statusCode: 409,
      statusMessage: 'RECURRING_NO_FREE_SLOTS',
      data: { conflicts: result.conflicts, skippedCount: result.skipped },
    })
  }

  const phone = body.guestMobile?.trim() || null
  if (phone && result.created > 0) {
    await notifyBookingConfirmed({
      phone,
      kind: 'package',
      clubName: clubNotifyName(club),
      clubId: club.id,
      bookingId: record.id,
      date: body.startDate,
      finishDate: body.finishDate,
      startTime: firstScheduleTime(expanded, body.times),
      sessionCount: result.created,
      paymentPaid: paymentStatus === 'PAID',
      guestName: personNotifyName(guest.guestName, guest.guestFamily),
      ...clubNotifyLocation(club),
    })
  }

  return {
    ...record,
    slotsCreated: result.created,
    slotsSkipped: result.skipped,
    conflicts: result.conflicts,
  }
})
