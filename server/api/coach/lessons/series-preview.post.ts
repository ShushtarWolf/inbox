import { requireApprovedCoach } from '../../../utils/coachClubLinks'
import { resolveCoachSeries } from '../../../utils/coachSeriesResolve'

/** Expand weekday rules and report conflicts without booking. */
export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  const user = await requireRole(event, 'COACH')
  const coach = await requireApprovedCoach(user.id)
  const body = await readBody<{
    clubId?: string
    startDate?: string
    finishDate?: string
    rules?: unknown
  }>(event)

  const resolved = await resolveCoachSeries({
    coachId: coach.id,
    sessionPrice: coach.sessionPrice,
    clubId: String(body.clubId || ''),
    startDate: String(body.startDate || ''),
    finishDate: String(body.finishDate || ''),
    rules: body.rules,
  })

  return {
    sessionCount: resolved.sessionCount,
    totalCourtCharge: resolved.totalCourtCharge,
    sessionPrice: resolved.sessionPrice,
    conflicts: resolved.conflicts,
  }
})
