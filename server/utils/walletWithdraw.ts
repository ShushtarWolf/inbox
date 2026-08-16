import { creditWallet, debitWallet, getOrCreateWallet } from './wallet'

export async function requestUserWithdraw(options: {
  userId: string
  amount: number
  sheba: string | null | undefined
  note?: string
}) {
  const amount = Math.floor(Number(options.amount))
  if (!Number.isFinite(amount) || amount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Withdraw amount must be positive' })
  }
  const sheba = options.sheba?.trim() || null
  if (!sheba) {
    throw createError({ statusCode: 400, statusMessage: 'SHEBA is required before withdraw' })
  }

  return prisma.$transaction(async (tx) => {
    const wallet = await getOrCreateWallet(options.userId, tx)
    if (wallet.balance < amount) {
      throw createError({ statusCode: 409, statusMessage: 'Insufficient wallet balance' })
    }

    const request = await tx.userWithdrawRequest.create({
      data: {
        userId: options.userId,
        amount,
        shebaSnapshot: sheba,
        status: 'PENDING',
        note: options.note || null,
      },
    })

    await debitWallet(options.userId, amount, {
      type: 'WITHDRAW_HOLD',
      withdrawRequestId: request.id,
      note: 'Withdraw request hold',
    }, tx)

    return request
  })
}

export async function markUserWithdrawPaid(requestId: string, note?: string) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.userWithdrawRequest.findUnique({ where: { id: requestId } })
    if (!request) throw createError({ statusCode: 404, statusMessage: 'Withdraw request not found' })
    if (request.status === 'PAID') return request
    if (request.status !== 'PENDING') {
      throw createError({ statusCode: 409, statusMessage: 'Withdraw request is not pending' })
    }

    const updated = await tx.userWithdrawRequest.update({
      where: { id: requestId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        note: note ?? request.note,
      },
    })

    const wallet = await getOrCreateWallet(request.userId, tx)
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        amount: 0,
        type: 'WITHDRAW_PAID',
        withdrawRequestId: request.id,
        note: note || 'Marked paid by admin',
      },
    })

    return updated
  })
}

export async function rejectUserWithdrawRequest(requestId: string, note?: string) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.userWithdrawRequest.findUnique({ where: { id: requestId } })
    if (!request) throw createError({ statusCode: 404, statusMessage: 'Withdraw request not found' })
    if (request.status !== 'PENDING') {
      throw createError({ statusCode: 409, statusMessage: 'Withdraw request is not pending' })
    }

    const updated = await tx.userWithdrawRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        rejectedAt: new Date(),
        note: note ?? request.note,
      },
    })

    await creditWallet(request.userId, request.amount, {
      type: 'WITHDRAW_RELEASE',
      withdrawRequestId: request.id,
      note: note || 'Withdraw rejected — balance restored',
    }, tx)

    return updated
  })
}
