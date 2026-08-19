import type { Prisma, WalletTransactionType } from '@prisma/client'
import { canCoverBookingWithWallet, shouldCreditTopUp } from '#shared/walletTopUp.ts'

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

/**
 * Athlete wallet is closed-loop platform credit.
 * Current credit sources (top-ups, refund credit, releases, adjustments) can be
 * spent on future bookings, but they are not eligible for bank cash-out.
 */
export async function getWalletWithdrawableBalance(_userId: string) {
  return 0
}

export async function creditWallet(
  userId: string,
  amount: number,
  meta: {
    type?: WalletTransactionType
    paymentId?: string
    bookingId?: string
    withdrawRequestId?: string
    note?: string
  },
  db: DbClient = prisma,
) {
  if (amount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Credit amount must be positive' })
  }
  const type = meta.type || 'REFUND_CREDIT'
  // Idempotent cancel/refund retries: one REFUND_CREDIT (or same typed credit) per paymentId.
  if (meta.paymentId && (type === 'REFUND_CREDIT' || type === 'TOPUP_CREDIT')) {
    const existing = await db.walletTransaction.findFirst({
      where: { paymentId: meta.paymentId, type },
    })
    if (existing) {
      return getOrCreateWallet(userId, db)
    }
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
      type,
      paymentId: meta.paymentId,
      bookingId: meta.bookingId,
      withdrawRequestId: meta.withdrawRequestId,
      note: meta.note,
    },
  })
  return updated
}

/**
 * Credit wallet after a verified top-up Payment. Idempotent on paymentId + TOPUP_CREDIT.
 * Safe to call on double callback when previousStatus was already PAID.
 */
export async function creditWalletForTopUpPayment(
  paymentId: string,
  previousStatus: string,
  db: DbClient = prisma,
) {
  const payment = await db.payment.findUnique({ where: { id: paymentId } })
  const existing = payment
    ? await db.walletTransaction.findFirst({
        where: { paymentId: payment.id, type: 'TOPUP_CREDIT' },
      })
    : null

  if (!shouldCreditTopUp({
    previousStatus,
    purpose: payment?.purpose,
    status: payment?.status,
    userId: payment?.userId,
    alreadyCredited: Boolean(existing),
  }) || !payment?.userId) {
    return {
      credited: false,
      reason: previousStatus === 'PAID'
        ? 'already_paid' as const
        : existing
          ? 'already_credited' as const
          : 'not_topup_paid' as const,
    }
  }

  await creditWallet(payment.userId, payment.amount, {
    type: 'TOPUP_CREDIT',
    paymentId: payment.id,
    note: 'Wallet top-up',
  }, db)
  return { credited: true, reason: 'ok' as const }
}

/** True when checkout may debit wallet for the full amount (MVP: no split). */
export function canDebitWalletForFullAmount(balance: number, amount: number): boolean {
  return canCoverBookingWithWallet(balance, amount)
}

export async function debitWallet(
  userId: string,
  amount: number,
  meta: {
    type?: WalletTransactionType
    paymentId?: string
    bookingId?: string
    withdrawRequestId?: string
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
      withdrawRequestId: meta.withdrawRequestId,
      note: meta.note,
    },
  })
  return updated
}
