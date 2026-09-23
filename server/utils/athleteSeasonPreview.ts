import { expandAthleteWeeklySeason, MAX_ATHLETE_SEASON_OCCURRENCES } from '#shared/athleteSeason.ts'
import { isPastDate } from '#shared/localDate.ts'
import { weekdayNameFromDate } from '#shared/recurringSessions.ts'
import type { SeasonSessionOccurrence } from '#shared/seasonSessions.ts'
import { previewSeasonSessions, type SeasonPreviewResult } from '../utils/seasonReserve'
import { addMinutes } from '../utils/slots'
import { hourFromTime } from '../utils/seasonSlots'

export type AthleteWeeklySeasonBody = {
  courtId?: string
  startDate?: string
  finishDate?: string
  startTime?: string
  endTime?: string
}

export function resolveAthleteWeeklyEndTime(startTime: string, endTime?: string): string {
  const start = startTime.trim().slice(0, 5)
  const end = (endTime || '').trim().slice(0, 5)
  if (end && end > start) return end
  const hour = hourFromTime(start)
  return addMinutes(start, 60) || `${String(hour + 1).padStart(2, '0')}:00`
}

/** Expand + preview athlete weekly series from a single slot template. */
export async function previewAthleteWeeklySeason(opts: {
  clubId: string
  courtId: string
  startDate: string
  finishDate: string
  startTime: string
  endTime?: string
}): Promise<SeasonPreviewResult & { sessions: SeasonSessionOccurrence[] }> {
  if (!opts.courtId || !opts.startDate || !opts.finishDate || !opts.startTime) {
    throw createError({ statusCode: 400, statusMessage: 'courtId, startDate, finishDate, startTime required' })
  }
  if (opts.finishDate < opts.startDate) {
    throw createError({ statusCode: 400, statusMessage: 'finishDate before startDate' })
  }
  if (isPastDate(opts.startDate)) {
    throw createError({ statusCode: 400, statusMessage: 'startDate in past' })
  }

  const court = await prisma.court.findFirst({
    where: { id: opts.courtId, clubId: opts.clubId },
    select: { id: true },
  })
  if (!court) {
    throw createError({ statusCode: 404, statusMessage: 'Court not found' })
  }

  const startTime = opts.startTime.trim().slice(0, 5)
  const endTime = resolveAthleteWeeklyEndTime(startTime, opts.endTime)
  const weekday = weekdayNameFromDate(opts.startDate)
  const sessions = expandAthleteWeeklySeason({
    startDate: opts.startDate,
    finishDate: opts.finishDate,
    rule: {
      weekday,
      startTime,
      endTime,
      courtId: opts.courtId,
    },
    maxOccurrences: MAX_ATHLETE_SEASON_OCCURRENCES,
  })

  if (!sessions.length) {
    throw createError({
      statusCode: 409,
      statusMessage: 'RECURRING_NO_FREE_SLOTS',
      data: { conflicts: [], skippedCount: 0, willCreateCount: 0 },
    })
  }

  const preview = await previewSeasonSessions({ clubId: opts.clubId, sessions })
  return { ...preview, sessions }
}
