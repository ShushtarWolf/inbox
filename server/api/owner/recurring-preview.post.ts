import { expandDayTimeRanges, type DayTimeRange } from '#shared/recurringSessions.ts'
import { generateRecurringCourtSlots, mergeRecurringResults } from '../../utils/generateRecurringSlots'
import { assertRecurringReserveEnabled } from '../../utils/recurringReserveGate'
import { assertDateNotInPast } from '../../utils/reservations'
import { resolveOwnerCourtIds } from '../../utils/resolveOwnerCourts'

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
  assertRecurringReserveEnabled(event)
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{
    slotId?: string
    courtIds?: string[]
    days?: string[]
    times?: string[]
    dayTimes?: Record<string, DayTimeRange>
    startDate?: string
    finishDate?: string
  }>(event)

  if (!body.startDate || !body.finishDate || !body.days?.length) {
    throw createError({ statusCode: 400, statusMessage: 'dates and days are required' })
  }
  if (body.finishDate < body.startDate) {
    throw createError({ statusCode: 400, statusMessage: 'Finish date must be on or after start date' })
  }
  assertDateNotInPast(body.startDate)

  const courtIds = await resolveOwnerCourtIds(club.id, body)
  const expanded = resolveExpanded(body.dayTimes, body.times, body.days)
  if (!Object.keys(expanded).length) {
    throw createError({ statusCode: 400, statusMessage: 'Schedule times are required' })
  }

  const parts = await Promise.all(courtIds.map((courtId) => generateRecurringCourtSlots({
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
  const result = mergeRecurringResults(parts)

  return {
    willCreateCount: result.created,
    skippedCount: result.skipped,
    willCreate: result.willCreate,
    conflicts: result.conflicts,
    courtIds,
  }
})
