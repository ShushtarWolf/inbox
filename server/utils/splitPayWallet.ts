import type { Prisma } from '@prisma/client'
import { parsePaymentMetadata } from '#shared/cancelRefund.ts'
import { readSplitPayMeta } from '#shared/splitPay.ts'
import { creditWallet } from './wallet'
import { prisma } from './prisma'

type DbClient = Prisma.TransactionClient | typeof prisma

/**
 * Restore wallet debit after split-pay IPG fail / hold abandon.
 * Idempotent via metadata.walletDebitReleased.
 */
export async function releaseSplitWalletDebit(paymentId: string, db: DbClient = prisma) {
  const payment = await db.payment.findUnique({ where: { id: paymentId } })
  if (!payment || payment.status === 'PAID' || payment.status === 'REFUNDED') return { released: false }

  const meta = parsePaymentMetadata(payment.metadataJson)
  const split = readSplitPayMeta(meta)
  if (!split || split.walletDebitAmount <= 0 || split.walletDebitReleased) {
    return { released: false }
  }

  const userId = payment.userId
    || (payment.bookingId
      ? (await db.booking.findUnique({ where: { id: payment.bookingId }, select: { userId: true } }))?.userId
      : null)
  if (!userId) return { released: false }

  await creditWallet(userId, split.walletDebitAmount, {
    type: 'REFUND_CREDIT',
    paymentId: payment.id,
    bookingId: payment.bookingId || undefined,
    note: 'split-pay-release',
  }, db)

  await db.payment.update({
    where: { id: payment.id },
    data: {
      metadataJson: JSON.stringify({
        ...meta,
        walletDebitReleased: true,
        walletDebitReleasedAt: new Date().toISOString(),
      }),
    },
  })
  return { released: true, amount: split.walletDebitAmount }
}

/** After IPG confirm: bump payment.amount to full (wallet+IPG) for settlement/refund. */
export async function promoteSplitPayAmountOnPaid(paymentId: string, db: DbClient = prisma) {
  const payment = await db.payment.findUnique({ where: { id: paymentId } })
  if (!payment || payment.status !== 'PAID') return
  const meta = parsePaymentMetadata(payment.metadataJson)
  const split = readSplitPayMeta(meta)
  if (!split || split.splitFullAmount <= payment.amount) return
  await db.payment.update({
    where: { id: payment.id },
    data: {
      amount: split.splitFullAmount,
      metadataJson: JSON.stringify({
        ...meta,
        splitPromoted: true,
        ipgChargeAmount: payment.amount,
      }),
    },
  })
}
