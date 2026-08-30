import { assertPackagesEnabled } from '../../../utils/packagesGate'
import { requireApprovedCoach, requireActiveClub } from '../../../utils/coachClubLinks'
import { expandPackageSessions, findPackageConflicts } from '../../../utils/packages'
import {
  expandDayTimeRanges,
  type DayTimeRange,
} from '#shared/recurringSessions.ts'

export default defineEventHandler(async (event) => {
  assertPackagesEnabled(event)
  const user = await requireRole(event, 'COACH')
  await requireApprovedCoach(user.id)
  const body = await readBody<{
    clubId?: string
    courtId?: string
    startDate?: string
    finishDate?: string
    days?: string[]
    dayTimes?: Record<string, DayTimeRange>
    timesJson?: string
    excludePackageId?: string
  }>(event)

  if (!body.clubId || !body.courtId || !body.startDate || !body.finishDate || !body.days?.length) {
    throw createError({ statusCode: 400, statusMessage: 'clubId, courtId, dates, and days required' })
  }
  await requireActiveClub(body.clubId)

  const club = await prisma.club.findFirst({ where: { id: body.clubId, status: 'ACTIVE' } })
  if (!club) throw createError({ statusCode: 404, statusMessage: 'Club not found' })

  const duration = club.defaultSessionDurationMinutes || 60
  const sessions = expandPackageSessions({
    startDate: body.startDate,
    finishDate: body.finishDate,
    days: body.days,
    dayTimes: body.dayTimes,
    timesJson: body.timesJson,
  }, duration)

  const conflicts = await findPackageConflicts({
    clubId: body.clubId,
    courtId: body.courtId,
    coachId: coach.id,
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
