import { normalizeGuestNamePair } from '#shared/guestName.ts'
import { expandDayTimeRanges, type DayTimeRange } from '#shared/recurringSessions.ts'
import { notifyBookingConfirmed, clubNotifyName, clubNotifyLocation, personNotifyName } from '../../utils/bookingNotify'
import { generateRecurringCourtSlots, mergeRecurringResults } from '../../utils/generateRecurringSlots'
import {
  loadEquipmentForBooking,
  parseEquipmentSelections,
  sumEquipmentPrices,
} from '../../utils/bookingTotal'
import { assertRecurringReserveEnabled } from '../../utils/recurringReserveGate'
import { assertDateNotInPast } from '../../utils/reservations'
import { resolveOwnerCourtIds } from '../../utils/resolveOwnerCourts'

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
  assertRecurringReserveEnabled(event)
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{
    guestName?: string
    guestFamily?: string
    guestMobile?: string
    days?: string[]
    times?: string[]
    dayTimes?: Record<string, DayTimeRange>
    startDate?: string
    finishDate?: string
    comments?: string
    slotId?: string
    courtIds?: string[]
    equipmentId?: string
    equipmentIds?: string[]
    equipmentQuantities?: Record<string, number>
    paymentMethod?: string
    paymentStatus?: string
    /** Required when preview would skip occupied/past slots. */
    acceptSkips?: boolean
  }>(event)

  if (!body.startDate || !body.finishDate) {
    throw createError({ statusCode: 400, statusMessage: 'Start and finish dates are required' })
  }
  if (body.finishDate < body.startDate) {
    throw createError({ statusCode: 400, statusMessage: 'Finish date must be on or after start date' })
  }
  assertDateNotInPast(body.startDate)

  const courtIds = await resolveOwnerCourtIds(club.id, body)

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

  const { storedJson, expanded } = resolveDayTimes(body.dayTimes, body.times, body.days)
  const guest = normalizeGuestNamePair(body.guestName, body.guestFamily)
  const hasSchedule = Boolean(body.days?.length && Object.keys(expanded).length)

  if (!hasSchedule) {
    throw createError({ statusCode: 400, statusMessage: 'schedule is required' })
  }

  const previewParts = await Promise.all(courtIds.map((courtId) => generateRecurringCourtSlots({
    clubId: club.id,
    courtId,
    anchorDate: body.startDate!,
    weekdays: body.days!,
    dayTimes: expanded,
    startDate: body.startDate,
    finishDate: body.finishDate,
    displayStatus: 'RESERVED',
    dryRun: true,
  })))
  const preview = mergeRecurringResults(previewParts)

  if (preview.created === 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'RECURRING_NO_FREE_SLOTS',
      data: { conflicts: preview.conflicts, skippedCount: preview.skipped },
    })
  }
  if (preview.skipped > 0 && !body.acceptSkips) {
    throw createError({
      statusCode: 409,
      statusMessage: 'RECURRING_CONFLICTS_NEED_CONFIRM',
      data: {
        willCreateCount: preview.created,
        skippedCount: preview.skipped,
        willCreate: preview.willCreate,
        conflicts: preview.conflicts,
      },
    })
  }

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
      equipmentId: equipmentItems[0]?.id || null,
      equipmentPrice,
    },
  })

  const resultParts = await Promise.all(courtIds.map((courtId) => generateRecurringCourtSlots({
    clubId: club.id,
    courtId,
    anchorDate: body.startDate!,
    weekdays: body.days!,
    dayTimes: expanded,
    startDate: body.startDate,
    finishDate: body.finishDate,
    displayStatus: 'RESERVED',
    guestInfo: {
      guestName: guest.guestName,
      guestFamily: guest.guestFamily,
      guestMobile: body.guestMobile || '',
      comments: body.comments,
      paymentMethod,
      paymentStatus,
      equipmentIds: equipmentItems.map((item) => item.id),
      equipmentQuantities,
      equipmentPrice,
    },
  })))
  const result = mergeRecurringResults(resultParts)

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
      kind: 'court',
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
    courtIds,
    slotsCreated: result.created,
    slotsSkipped: result.skipped,
    conflicts: result.conflicts,
  }
})
