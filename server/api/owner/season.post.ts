import { normalizeGuestNamePair } from '#shared/guestName.ts'
import { getPaymentsMode } from '#shared/payments.ts'
import { isRecurringReserveEnabled } from '#shared/recurringReserve.ts'
import { expandDayTimeRanges, type DayTimeRange } from '#shared/recurringSessions.ts'
import { notifyBookingConfirmed, clubNotifyName, clubNotifyLocation, personNotifyName } from '../../utils/bookingNotify'
import { generateRecurringCourtSlots } from '../../utils/generateRecurringSlots'
import { equipmentPriceAtBooking } from '../../utils/bookingTotal'
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

export default defineEventHandler(async (event) => {
  if (!isRecurringReserveEnabled()) {
    throw createError({
      statusCode: 403,
      statusMessage: 'RECURRING_RESERVE_DISABLED',
    })
  }
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
    equipmentId?: string
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

  let equipmentPrice = 0
  if (body.equipmentId) {
    const equipment = await prisma.equipment.findFirst({
      where: { id: body.equipmentId, clubId: club.id },
    })
    if (equipment) equipmentPrice = equipmentPriceAtBooking(equipment)
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
    displayStatus: 'RESERVED',
    dryRun: true,
  })

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
      equipmentId: body.equipmentId || null,
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
    displayStatus: 'RESERVED',
    guestInfo: {
      guestName: guest.guestName,
      guestFamily: guest.guestFamily,
      guestMobile: body.guestMobile || '',
      comments: body.comments,
      paymentMethod: getPaymentsMode() === 'pay_at_club'
        ? 'CASH'
        : ((body.paymentMethod as 'IPG' | 'CASH' | undefined) || 'CASH'),
      paymentStatus: body.paymentStatus === 'PAID' ? 'PAID' : 'PAY_AT_CLUB',
      equipmentId: body.equipmentId,
      equipmentPrice,
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
      kind: 'court',
      clubName: clubNotifyName(club),
      clubId: club.id,
      bookingId: record.id,
      date: body.startDate,
      startTime: firstScheduleTime(expanded, body.times),
      paymentPaid: body.paymentStatus === 'PAID',
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
