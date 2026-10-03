import { transferClubCoach } from '../../utils/walletTransfer'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'finance:payouts')
  const body = await readBody<{
    coachId?: string
    amount?: number
    note?: string
    direction?: 'club_to_coach' | 'coach_to_club'
  }>(event)

  if (!body.coachId) {
    throw createError({ statusCode: 400, statusMessage: 'coachId required' })
  }

  const result = await transferClubCoach({
    direction: body.direction === 'coach_to_club' ? 'coach_to_club' : 'club_to_coach',
    clubId: club.id,
    coachId: body.coachId,
    amount: Number(body.amount),
    note: body.note,
  })

  return { ok: true, ...result }
})
