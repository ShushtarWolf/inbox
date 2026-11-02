import { requestClubWithdraw } from '../../utils/settlement'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'finance:payouts')
  const body = await readBody<{ amount?: number; note?: string }>(event)

  const pendingSheba = await prisma.shebaChangeRequest.findFirst({
    where: { clubId: club.id, status: 'PENDING' },
  })
  if (pendingSheba && !club.sheba) {
    throw createError({ statusCode: 409, statusMessage: 'SHEBA pending admin approval' })
  }
  if (!club.sheba) {
    throw createError({ statusCode: 400, statusMessage: 'SHEBA is required before withdraw' })
  }

  const request = await requestClubWithdraw({
    clubId: club.id,
    amount: Number(body.amount),
    sheba: club.sheba,
    note: body.note,
  })

  return {
    id: request.id,
    amount: request.amount,
    status: request.status,
    shebaSnapshot: request.shebaSnapshot,
    createdAt: request.createdAt,
  }
})
