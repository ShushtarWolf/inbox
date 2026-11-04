import { assertUserCanBankWithdraw, requestUserWithdraw } from '../../utils/walletWithdraw'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  await assertUserCanBankWithdraw(user.id)

  const body = await readBody<{ amount?: number; note?: string; idempotencyKey?: string }>(event)
  const headerKey = getHeader(event, 'idempotency-key')

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { sheba: true },
  })
  const pendingSheba = await prisma.shebaChangeRequest.findFirst({
    where: { userId: user.id, status: 'PENDING' },
  })
  if (pendingSheba && !dbUser?.sheba) {
    throw createError({ statusCode: 409, statusMessage: 'SHEBA pending admin approval' })
  }
  if (!dbUser?.sheba) {
    throw createError({ statusCode: 400, statusMessage: 'SHEBA is required before withdraw' })
  }

  const request = await requestUserWithdraw({
    userId: user.id,
    amount: Number(body.amount),
    sheba: dbUser.sheba,
    note: body.note,
    idempotencyKey: body.idempotencyKey || headerKey || null,
  })

  return {
    id: request.id,
    amount: request.amount,
    status: request.status,
    rail: request.rail,
    shebaSnapshot: request.shebaSnapshot,
    createdAt: request.createdAt,
  }
})
