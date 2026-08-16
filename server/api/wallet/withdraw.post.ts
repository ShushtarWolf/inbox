import { requestUserWithdraw } from '../../utils/walletWithdraw'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{ amount?: number; note?: string }>(event)

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { sheba: true },
  })
  if (!dbUser?.sheba) {
    throw createError({ statusCode: 400, statusMessage: 'SHEBA is required before withdraw' })
  }

  const request = await requestUserWithdraw({
    userId: user.id,
    amount: Number(body.amount),
    sheba: dbUser.sheba,
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
