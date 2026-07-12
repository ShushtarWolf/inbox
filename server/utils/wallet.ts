import type { Prisma, WalletTransactionType } from '@prisma/client'

type DbClient = Prisma.TransactionClient | typeof prisma

export async function getOrCreateWallet(userId: string, db: DbClient = prisma) {
  return db.wallet.upsert({
    where: { userId },
    update: {},
    create: { userId },
  })
}

export async function getWalletBalance(userId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { userId } })
  return wallet?.balance ?? 0
}

export async function creditWallet(
  userId: string,
  amount: number,
  meta: {
    type?: WalletTransactionType
    paymentId?: string
    bookingId?: string
    note?: string
  },
  db: DbClient = prisma,
) {
  if (amount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Credit amount must be positive' })
  }
  const wallet = await getOrCreateWallet(userId, db)
  const updated = await db.wallet.update({
    where: { id: wallet.id },
    data: { balance: { increment: amount } },
  })
  await db.walletTransaction.create({
    data: {
      walletId: wallet.id,
      amount,
      type: meta.type || 'REFUND_CREDIT',
      paymentId: meta.paymentId,
      bookingId: meta.bookingId,
      note: meta.note,
    },
  })
  return updated
}

export async function debitWallet(
  userId: string,
  amount: number,
  meta: {
    type?: WalletTransactionType
    paymentId?: string
    bookingId?: string
    note?: string
  },
  db: DbClient = prisma,
) {
  if (amount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Debit amount must be positive' })
  }
  const wallet = await getOrCreateWallet(userId, db)
  if (wallet.balance < amount) {
    throw createError({ statusCode: 409, statusMessage: 'Insufficient wallet balance' })
  }
  const updated = await db.wallet.update({
    where: { id: wallet.id },
    data: { balance: { decrement: amount } },
  })
  await db.walletTransaction.create({
    data: {
      walletId: wallet.id,
      amount: -amount,
      type: meta.type || 'PAYMENT_DEBIT',
      paymentId: meta.paymentId,
      bookingId: meta.bookingId,
      note: meta.note,
    },
  })
  return updated
}
