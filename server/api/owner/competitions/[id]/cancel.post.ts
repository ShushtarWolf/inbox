import { cancelCompetition } from '../../../../utils/competitions'
import { assertCompetitionsVisibleForClub } from '../../../../utils/competitionsGate'

export default defineEventHandler(async (event) => {
  const { user, club } = await requireOwnerClub(event, 'calendar')
  assertCompetitionsVisibleForClub(club.slug, event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing competition id' })

  const existing = await prisma.competition.findFirst({
    where: { id, clubId: club.id },
  })
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Competition not found' })
  }
  if (existing.status === 'CANCELLED' || existing.status === 'COMPLETED') {
    throw createError({ statusCode: 409, statusMessage: 'Competition cannot be cancelled' })
  }

  const body = await readBody<{ reason?: string }>(event)
  const cancelReason = body?.reason?.trim()
    || 'مسابقه توسط باشگاه لغو شد. مبلغ پرداختی شرکت‌کنندگان تأییدشده به کیف پول بازگردانده می‌شود.'

  const competition = await cancelCompetition({
    competitionId: id,
    cancelledBy: user.id,
    cancelReason,
    refundEntries: true,
  })

  return { ok: true, competition }
})
