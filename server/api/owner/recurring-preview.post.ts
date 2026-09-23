import type { DayTimeRange } from '#shared/recurringSessions.ts'
import {
  expandSeasonRules,
  legacySeasonToRules,
  type SeasonSessionOccurrence,
  type SeasonSessionRule,
} from '#shared/seasonSessions.ts'
import { assertRecurringReserveEnabled } from '../../utils/recurringReserveGate'
import { assertDateNotInPast } from '../../utils/reservations'
import { resolveOwnerCourtIds } from '../../utils/resolveOwnerCourts'
import { previewSeasonSessions } from '../../utils/seasonReserve'

function normalizeSessions(raw: unknown): SeasonSessionOccurrence[] {
  if (!Array.isArray(raw)) return []
  const out: SeasonSessionOccurrence[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const s = row as Record<string, unknown>
    const date = String(s.date || '').trim()
    const startTime = String(s.startTime || '').trim().slice(0, 5)
    const courtId = String(s.courtId || '').trim()
    if (!date || !startTime || !courtId) continue
    out.push({ date, startTime, courtId })
  }
  return out
}

function normalizeRules(raw: unknown): SeasonSessionRule[] {
  if (!Array.isArray(raw)) return []
  const out: SeasonSessionRule[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const s = row as Record<string, unknown>
    const weekday = String(s.weekday || '').trim()
    const startTime = String(s.startTime || '').trim().slice(0, 5)
    const endTime = String(s.endTime || '').trim().slice(0, 5)
    const courtId = String(s.courtId || '').trim()
    if (!weekday || !startTime || !endTime || !courtId) continue
    out.push({ weekday, startTime, endTime, courtId })
  }
  return out
}

/** Dry-run conflict preview for season desk reserve (soft conflicts — never blocks). */
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
    rules?: SeasonSessionRule[]
    sessions?: SeasonSessionOccurrence[]
  }>(event)

  if (!body.startDate || !body.finishDate) {
    throw createError({ statusCode: 400, statusMessage: 'dates are required' })
  }
  if (body.finishDate < body.startDate) {
    throw createError({ statusCode: 400, statusMessage: 'Finish date must be on or after start date' })
  }
  assertDateNotInPast(body.startDate)

  let sessions = normalizeSessions(body.sessions)
  if (!sessions.length) {
    let rules = normalizeRules(body.rules)
    if (!rules.length) {
      const courtIds = await resolveOwnerCourtIds(club.id, body)
      rules = legacySeasonToRules({
        days: body.days || [],
        dayTimes: body.dayTimes,
        times: body.times,
        courtIds,
      })
    }
    if (!rules.length) {
      throw createError({ statusCode: 400, statusMessage: 'Schedule times are required' })
    }
    sessions = expandSeasonRules({
      startDate: body.startDate,
      finishDate: body.finishDate,
      rules,
    })
  }

  const result = await previewSeasonSessions({ clubId: club.id, sessions })
  return {
    willCreateCount: result.willCreateCount,
    skippedCount: result.skippedCount,
    willCreate: result.willCreate,
    conflicts: result.conflicts,
    totalAmount: result.totalAmount,
  }
})
