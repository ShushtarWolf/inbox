import { isRecurringReserveEnabled } from '#shared/recurringReserve.ts'
import { expandDayTimeRanges, type DayTimeRange } from '#shared/recurringSessions.ts'
import { generateRecurringCourtSlots } from '../../utils/generateRecurringSlots'
import { assertDateNotInPast } from '../../utils/reservations'

function resolveExpanded(
  dayTimes?: Record<string, DayTimeRange>,
  times?: string[],
  days?: string[],
): Record<string, string[]> {
  if (dayTimes && Object.keys(dayTimes).length) {
    return expandDayTimeRanges(dayTimes)
  }
  if (times?.length && days?.length) {
    const lastTime = times[times.length - 1]
    const firstTime = times[0]
    if (!lastTime || !firstTime) return {}
    const endHour = Number.parseInt(lastTime.slice(0, 2), 10) + 1
    const legacyRange = { start: firstTime, end: `${String(endHour).padStart(2, '0')}:00` }
    const mapped = Object.fromEntries(days.map((day) => [day, legacyRange])) as Record<string, DayTimeRange>
    return expandDayTimeRanges(mapped)
  }
  return {}
}

/** Dry-run conflict preview for season / package recurring desk reserve. */
export default defineEventHandler(async (event) => {
  if (!isRecurringReserveEnabled()) {
    throw createError({
      statusCode: 403,
      statusMessage: 'RECURRING_RESERVE_DISABLED',
    })
  }
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{
    slotId?: string
    days?: string[]
    times?: string[]
    dayTimes?: Record<string, DayTimeRange>
    startDate?: string
    finishDate?: string
  }>(event)

  if (!body.slotId || !body.startDate || !body.finishDate || !body.days?.length) {
    throw createError({ statusCode: 400, statusMessage: 'slotId, dates, and days are required' })
  }
  if (body.finishDate < body.startDate) {
    throw createError({ statusCode: 400, statusMessage: 'Finish date must be on or after start date' })
  }
  assertDateNotInPast(body.startDate)

  const slot = await prisma.slot.findFirst({
    where: { id: body.slotId, court: { clubId: club.id } },
  })
  if (!slot) throw createError({ statusCode: 404, statusMessage: 'Slot not found' })

  const expanded = resolveExpanded(body.dayTimes, body.times, body.days)
  if (!Object.keys(expanded).length) {
    throw createError({ statusCode: 400, statusMessage: 'Schedule times are required' })
  }

  const result = await generateRecurringCourtSlots({
    clubId: club.id,
    courtId: slot.courtId,
    anchorDate: body.startDate,
    weekdays: body.days,
    dayTimes: expanded,
    startDate: body.startDate,
    finishDate: body.finishDate,
    displayStatus: 'RESERVED',
    dryRun: true,
  })

  return {
    willCreateCount: result.created,
    skippedCount: result.skipped,
    willCreate: result.willCreate,
    conflicts: result.conflicts,
  }
})
