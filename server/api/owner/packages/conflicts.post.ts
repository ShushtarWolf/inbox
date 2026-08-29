import { assertPackagesEnabled } from '../../../../utils/packagesGate'
import { expandPackageSessions, findPackageConflicts } from '../../../../utils/packages'
import {
  expandDayTimeRanges,
  type DayTimeRange,
} from '#shared/recurringSessions.ts'

export default defineEventHandler(async (event) => {
  assertPackagesEnabled(event)
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{
    courtId?: string
    coachId?: string | null
    startDate?: string
    finishDate?: string
    days?: string[]
    dayTimes?: Record<string, DayTimeRange>
    timesJson?: string
    excludePackageId?: string
  }>(event)

  if (!body.courtId || !body.startDate || !body.finishDate || !body.days?.length) {
    throw createError({ statusCode: 400, statusMessage: 'courtId, dates, and days required' })
  }

  const court = await prisma.court.findFirst({
    where: { id: body.courtId, clubId: club.id },
    include: { club: true },
  })
  if (!court) throw createError({ statusCode: 404, statusMessage: 'Court not found' })

  const duration = club.defaultSessionDurationMinutes || 60
  const sessions = expandPackageSessions({
    startDate: body.startDate,
    finishDate: body.finishDate,
    days: body.days,
    dayTimes: body.dayTimes,
    timesJson: body.timesJson,
  }, duration)

  const conflicts = await findPackageConflicts({
    clubId: club.id,
    courtId: body.courtId,
    coachId: body.coachId,
    sessions,
    excludePackageId: body.excludePackageId,
  })

  return {
    sessions,
    sessionCount: sessions.length,
    conflicts,
    dayTimesExpanded: body.dayTimes ? expandDayTimeRanges(body.dayTimes) : null,
  }
})
