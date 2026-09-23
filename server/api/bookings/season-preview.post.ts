import { assertAthleteSeasonEnabled } from '../../utils/athleteSeasonGate'
import { previewAthleteWeeklySeason } from '../../utils/athleteSeasonPreview'

export default defineEventHandler(async (event) => {
  assertAthleteSeasonEnabled(event)
  const user = await requireUser(event)
  void user

  const body = await readBody<{
    clubId?: string
    courtId?: string
    startDate?: string
    finishDate?: string
    startTime?: string
    endTime?: string
  }>(event)

  const clubId = String(body.clubId || '').trim()
  if (!clubId) throw createError({ statusCode: 400, statusMessage: 'clubId required' })

  const club = await prisma.club.findFirst({
    where: { id: clubId, status: 'ACTIVE' },
    select: { id: true },
  })
  if (!club) throw createError({ statusCode: 404, statusMessage: 'Club not found' })

  const result = await previewAthleteWeeklySeason({
    clubId,
    courtId: String(body.courtId || '').trim(),
    startDate: String(body.startDate || '').trim(),
    finishDate: String(body.finishDate || '').trim(),
    startTime: String(body.startTime || '').trim(),
    endTime: body.endTime ? String(body.endTime).trim() : undefined,
  })

  return {
    willCreate: result.willCreate,
    willCreateCount: result.willCreateCount,
    conflicts: result.conflicts,
    skippedCount: result.skippedCount,
    totalAmount: result.totalAmount,
  }
})
