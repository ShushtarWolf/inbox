import type { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { creditWallet, debitWallet } from './wallet'
import { getOrCreateClubWallet } from './settlement'

type DbClient = Prisma.TransactionClient

/**
 * Record-keeping transfer between a club wallet and a coach user wallet.
 * Athletes must never call this.
 */
export async function transferClubCoach(opts: {
  direction: 'club_to_coach' | 'coach_to_club'
  clubId: string
  coachId: string
  amount: number
  note?: string
}) {
  const amount = Math.floor(Number(opts.amount))
  if (!Number.isFinite(amount) || amount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Transfer amount must be positive' })
  }

  const coach = await prisma.coach.findUnique({
    where: { id: opts.coachId },
    select: { id: true, userId: true },
  })
  if (!coach?.userId) {
    throw createError({ statusCode: 404, statusMessage: 'Coach not found' })
  }

  const transferGroupId = randomUUID()
  const note = opts.note?.trim() || 'Internal transfer'
  const tagged = `${note} [transfer:${transferGroupId}]`

  return prisma.$transaction(async (tx) => {
    if (opts.direction === 'club_to_coach') {
      await debitClubAvailable(opts.clubId, amount, tagged, tx)
      await creditWallet(coach.userId, amount, {
        type: 'INTERNAL_TRANSFER_IN',
        note: tagged,
      }, tx)
    }
    else {
      await debitWallet(coach.userId, amount, {
        type: 'INTERNAL_TRANSFER_OUT',
        note: tagged,
      }, tx)
      await creditClubAvailable(opts.clubId, amount, tagged, tx)
    }
    return { transferGroupId, amount, direction: opts.direction }
  })
}

async function debitClubAvailable(clubId: string, amount: number, note: string, db: DbClient) {
  const wallet = await getOrCreateClubWallet(clubId, db)
  const claimed = await db.clubWallet.updateMany({
    where: { id: wallet.id, availableBalance: { gte: amount }, balance: { gte: amount } },
    data: {
      balance: { decrement: amount },
      availableBalance: { decrement: amount },
    },
  })
  if (claimed.count !== 1) {
    throw createError({ statusCode: 409, statusMessage: 'Insufficient club wallet balance' })
  }
  await db.clubWalletTransaction.create({
    data: {
      walletId: wallet.id,
      amount: -amount,
      type: 'INTERNAL_TRANSFER_OUT',
      note,
    },
  })
}

async function creditClubAvailable(clubId: string, amount: number, note: string, db: DbClient) {
  const wallet = await getOrCreateClubWallet(clubId, db)
  await db.clubWallet.update({
    where: { id: wallet.id },
    data: {
      balance: { increment: amount },
      availableBalance: { increment: amount },
    },
  })
  await db.clubWalletTransaction.create({
    data: {
      walletId: wallet.id,
      amount,
      type: 'INTERNAL_TRANSFER_IN',
      note,
    },
  })
}
