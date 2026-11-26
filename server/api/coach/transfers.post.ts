import { transferClubCoach } from '../../utils/walletTransfer'

export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  const user = await requireUser(event)
  const coach = await prisma.coach.findFirst({
    where: { userId: user.id },
    select: { id: true, clubId: true },
  })
  if (!coach) {
    throw createError({ statusCode: 403, statusMessage: 'Coach profile required' })
  }

  const body = await readBody<{
    clubId?: string
    amount?: number
    note?: string
    direction?: 'club_to_coach' | 'coach_to_club'
  }>(event)

  const clubId = body.clubId || coach.clubId
  if (!clubId) {
    throw createError({ statusCode: 400, statusMessage: 'clubId required' })
  }

  if (body.direction === 'club_to_coach') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only club owner can transfer from club wallet to coach',
    })
  }

  const result = await transferClubCoach({
    direction: 'coach_to_club',
    clubId,
    coachId: coach.id,
    amount: Number(body.amount),
    note: body.note,
  })

  return { ok: true, ...result }
})
