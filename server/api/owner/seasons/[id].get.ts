import { resolveSeasonGuestFields } from '#shared/seasonFormHydrate.ts'
import type { SeasonSessionOccurrence, SeasonSessionRule } from '#shared/seasonSessions.ts'
import { parseSeasonTimesJson, weekdayNameFromDate } from '#shared/recurringSessions.ts'
import { legacySeasonToRules, seasonRulesFromOccurrences } from '#shared/seasonSessions.ts'
import { loadOwnerSeriesBookingsBySeasonId } from '../../../utils/ownerSeriesCancel'

function parseSessionsJson(raw: string): SeasonSessionOccurrence[] {
  try {
    const parsed = JSON.parse(raw || '[]')
    if (!Array.isArray(parsed)) return []
    const out: SeasonSessionOccurrence[] = []
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue
      const date = String((row as { date?: string }).date || '').trim()
      const startTime = String((row as { startTime?: string }).startTime || '').trim().slice(0, 5)
      const courtId = String((row as { courtId?: string }).courtId || '').trim()
      if (date && startTime && courtId) out.push({ date, startTime, courtId })
    }
    return out
  }
  catch {
    return []
  }
}

/** Merge back-to-back stored hours so a 2-hour weekly session reloads as one row. */
function rulesFromSessions(sessions: SeasonSessionOccurrence[]): SeasonSessionRule[] {
  return seasonRulesFromOccurrences(sessions)
}

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const id = getRouterParam(event, 'id')?.trim()
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const row = await prisma.seasonBooking.findFirst({
    where: { id, clubId: club.id },
    select: {
      id: true,
      guestName: true,
      guestFamily: true,
      guestMobile: true,
      startDate: true,
      finishDate: true,
      daysJson: true,
      timesJson: true,
      comments: true,
      createdAt: true,
    },
  })
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const sessions = parseSessionsJson(row.timesJson)
  let rules = rulesFromSessions(sessions)
  const days = (() => {
    try {
      const parsed = JSON.parse(row.daysJson || '[]')
      return Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === 'string' && Boolean(d.trim())) : []
    }
    catch {
      return []
    }
  })()
  if (!rules.length && days.length) {
    const series = await loadOwnerSeriesBookingsBySeasonId(club.id, id)
    const courtIds = [...new Set(series.map((booking) => booking.slot.courtId).filter(Boolean))]
    const dayTimes = parseSeasonTimesJson(row.timesJson, days)
    rules = legacySeasonToRules({ days, dayTimes, courtIds })
  }
  const weekdays = rules.length
    ? [...new Set(rules.map((rule) => rule.weekday))]
    : [...new Set(sessions.map((s) => weekdayNameFromDate(s.date)).filter(Boolean))]

  const guest = resolveSeasonGuestFields(row)

  return {
    season: {
      id: row.id,
      guestName: guest.guestName,
      guestFamily: guest.guestFamily,
      guestLabel: guest.guestLabel,
      guestMobile: row.guestMobile,
      startDate: row.startDate,
      finishDate: row.finishDate,
      days,
      weekdays,
      comments: row.comments,
      createdAt: row.createdAt.toISOString(),
      rules,
      sessions,
    },
  }
})
