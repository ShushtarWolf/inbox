import { computeCoachCourtCharge } from '#shared/coachCourt.ts'
import {
  coachBusyKeyFromSession,
  expandCoachSeries,
  matchCoachSeries,
  type CoachSeriesConflict,
  type CoachSeriesSlot,
} from '#shared/coachSeries.ts'
import type { SeasonSessionRule } from '#shared/seasonSessions.ts'
import { IRAN_WEEKDAY_ORDER } from '#shared/recurringSessions.ts'
import { assertExternalBookingAllowedIfEnabled } from './externalBookingGuard'
import { requireActiveClub } from './coachClubLinks'
import { prisma } from './prisma'
import { ensureSlotsForDate } from './slots'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const HHMM = /^\d{2}:\d{2}$/

export type ResolvedCoachSeries = {
  sessionPrice: number
  sessionCount: number
  totalCourtCharge: number
  conflicts: CoachSeriesConflict[]
  bookable: CoachSeriesSlot[]
  club: {
    id: string
    nameFa: string
    nameEn: string
    addressFa: string | null
    addressEn: string | null
    lat: number | null
    lng: number | null
  }
}

function normalizeRules(raw: unknown, courtIds: Set<string>): SeasonSessionRule[] {
  if (!Array.isArray(raw)) return []
  const weekdays = new Set<string>(IRAN_WEEKDAY_ORDER)
  const out: SeasonSessionRule[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const rule = row as Record<string, unknown>
    const weekday = String(rule.weekday || '').trim()
    const startTime = String(rule.startTime || '').trim().slice(0, 5)
    const endTime = String(rule.endTime || '').trim().slice(0, 5)
    const courtId = String(rule.courtId || '').trim()
    if (!weekdays.has(weekday) || !HHMM.test(startTime) || !HHMM.test(endTime) || !courtIds.has(courtId)) continue
    if (endTime <= startTime) continue
    out.push({ weekday, startTime, endTime, courtId })
  }
  return out
}

export async function resolveCoachSeries(opts: {
  coachId: string
  sessionPrice: number
  clubId: string
  startDate: string
  finishDate: string
  rules: unknown
}): Promise<ResolvedCoachSeries> {
  const startDate = opts.startDate.trim()
  const finishDate = opts.finishDate.trim()
  if (!ISO_DATE.test(startDate) || !ISO_DATE.test(finishDate) || finishDate < startDate) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const club = await requireActiveClub(opts.clubId)
  const courts = await prisma.court.findMany({
    where: { clubId: club.id },
    select: { id: true },
  })
  const courtIds = new Set(courts.map((court) => court.id))
  const rules = normalizeRules(opts.rules, courtIds)
  if (!rules.length) throw createError({ statusCode: 400, statusMessage: 'Invalid input' })

  const expanded = expandCoachSeries({ startDate, finishDate, rules })
  if (!expanded.ok && expanded.reason === 'cap') {
    throw createError({ statusCode: 400, statusMessage: 'Too many sessions' })
  }
  if (!expanded.ok) {
    throw createError({ statusCode: 400, statusMessage: 'No sessions in range' })
  }

  const dates = [...new Set(expanded.occurrences.map((row) => row.date))]
  for (const date of dates) {
    await ensureSlotsForDate(club.id, date)
  }

  const wantedCourts = [...new Set(rules.map((rule) => rule.courtId))]
  const slots = await prisma.slot.findMany({
    where: { date: { in: dates }, courtId: { in: wantedCourts } },
    include: { court: true, booking: { select: { id: true, status: true } } },
  })
  const coachSessions = await prisma.coachSession.findMany({
    where: {
      coachId: opts.coachId,
      status: { not: 'CANCELLED' },
      date: { gte: startDate, lte: finishDate },
    },
    select: { date: true, startTime: true },
  })

  const seriesSlots: CoachSeriesSlot[] = slots.map((slot) => {
    const price = computeCoachCourtCharge({
      courtPrice: slot.court.price,
      startTime: slot.startTime,
      pricingJson: slot.court.pricingJson,
    })
    const staleCancelled = slot.displayStatus === 'FREE' && slot.booking?.status === 'CANCELLED'
    return {
      id: slot.id,
      courtId: slot.courtId,
      date: slot.date,
      startTime: slot.startTime.slice(0, 5),
      endTime: (slot.endTime || '').slice(0, 5),
      displayStatus: slot.displayStatus,
      bookingActive: Boolean(slot.booking && !staleCancelled),
      staleCancelledBookingId: staleCancelled ? slot.booking!.id : null,
      charge: price.charge,
      courtPrice: slot.court.price,
      pricingJson: slot.court.pricingJson,
    }
  })

  const matched = matchCoachSeries({
    occurrences: expanded.occurrences,
    slots: seriesSlots,
    busyKeys: coachSessions.map((session) => coachBusyKeyFromSession(session.date, session.startTime)),
  })

  let conflicts = matched.conflicts
  if (!conflicts.length && matched.bookable.length) {
    try {
      await assertExternalBookingAllowedIfEnabled({
        club: {
          id: club.id,
          slug: club.slug,
          defaultSessionDurationMinutes: club.defaultSessionDurationMinutes,
          openHour: club.openHour,
          closeHour: club.closeHour,
        },
        slots: matched.bookable.map((slot) => ({
          courtId: slot.courtId,
          date: slot.date,
          startTime: slot.startTime,
        })),
      })
    }
    catch {
      conflicts = matched.bookable.map((slot) => ({
        date: slot.date,
        startTime: slot.startTime,
        courtId: slot.courtId,
        reason: 'taken' as const,
      }))
    }
  }

  return {
    sessionPrice: opts.sessionPrice,
    sessionCount: conflicts.length ? 0 : matched.bookable.length,
    totalCourtCharge: conflicts.length ? 0 : matched.totalCourtCharge,
    conflicts,
    bookable: conflicts.length ? [] : matched.bookable,
    club: {
      id: club.id,
      nameFa: club.nameFa,
      nameEn: club.nameEn,
      addressFa: club.addressFa,
      addressEn: club.addressEn,
      lat: club.lat,
      lng: club.lng,
    },
  }
}
