import { formatGuestDisplayName } from '#shared/guestName.ts'
import type { SeasonSessionOccurrence, SeasonSessionRule } from '#shared/seasonSessions.ts'
import { weekdayNameFromDate } from '#shared/recurringSessions.ts'
import { deriveSeasonRulesFromSlots } from '#shared/seasonSessions.ts'

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

function endTimeAfterStart(startTime: string): string {
  const [hRaw, mRaw] = startTime.split(':')
  const h = Number(hRaw) || 0
  const m = Number(mRaw) || 0
  const total = h * 60 + m + 60
  const eh = Math.min(24, Math.floor(total / 60))
  const em = total % 60
  if (eh >= 24) return '24:00'
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
}

function rulesFromSessions(sessions: SeasonSessionOccurrence[]): SeasonSessionRule[] {
  const slots = sessions.map((session) => ({
    date: session.date,
    startTime: session.startTime,
    endTime: endTimeAfterStart(session.startTime),
    courtId: session.courtId,
  }))
  return deriveSeasonRulesFromSlots(slots)
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
  const rules = rulesFromSessions(sessions)
  const weekdays = [...new Set(sessions.map((s) => weekdayNameFromDate(s.date)).filter(Boolean))]

  return {
    season: {
      id: row.id,
      guestName: row.guestName,
      guestFamily: row.guestFamily,
      guestLabel: formatGuestDisplayName(row.guestName, row.guestFamily),
      guestMobile: row.guestMobile,
      startDate: row.startDate,
      finishDate: row.finishDate,
      days: (() => {
        try {
          const parsed = JSON.parse(row.daysJson || '[]')
          return Array.isArray(parsed) ? parsed : []
        }
        catch {
          return []
        }
      })(),
      weekdays,
      comments: row.comments,
      createdAt: row.createdAt.toISOString(),
      rules,
      sessions,
    },
  }
})
