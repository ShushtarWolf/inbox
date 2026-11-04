import type { Prisma } from '@prisma/client'
import { parsePaymentMetadata } from '#shared/cancelRefund.ts'
import { readSplitPayMeta } from '#shared/splitPay.ts'
import { creditWallet } from './wallet'
import { prisma } from './prisma'

type DbClient = Prisma.TransactionClient | typeof prisma

/**
 * Restore wallet debit after split-pay IPG fail / hold abandon.
 * Idempotent via metadata.walletDebitReleased. Row-locked so concurrent releases cannot double-credit.
 *
 * Card/IPG share is NOT restored here — that rail is SEP reverse or closed-loop
 * refund on cancel; this only returns the wallet portion of a split.
 */
export async function releaseSplitWalletDebit(paymentId: string, db: DbClient = prisma) {
  const run = async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`
    const payment = await tx.payment.findUnique({ where: { id: paymentId } })
    if (!payment || payment.status === 'PAID' || payment.status === 'REFUNDED') {
      return { released: false as const }
    }

    const meta = parsePaymentMetadata(payment.metadataJson)
    const split = readSplitPayMeta(meta)
    if (!split || split.walletDebitAmount <= 0 || split.walletDebitReleased) {
      return { released: false as const }
    }

    const userId = payment.userId
      || (payment.bookingId
        ? (await tx.booking.findUnique({ where: { id: payment.bookingId }, select: { userId: true } }))?.userId
        : null)
    if (!userId) return { released: false as const }

    await creditWallet(userId, split.walletDebitAmount, {
      type: 'REFUND_CREDIT',
      paymentId: payment.id,
      bookingId: payment.bookingId || undefined,
      note: 'split-pay-release',
    }, tx)

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        metadataJson: JSON.stringify({
          ...meta,
          walletDebitReleased: true,
          walletDebitReleasedAt: new Date().toISOString(),
        }),
      },
    })
    return { released: true as const, amount: split.walletDebitAmount }
  }

  if (db === prisma) {
    return prisma.$transaction(run)
  }
  return run(db as Prisma.TransactionClient)
}

/** After IPG confirm: bump payment.amount to full (wallet+IPG) for settlement/refund. */
export async function promoteSplitPayAmountOnPaid(paymentId: string, db: DbClient = prisma) {
  const payment = await db.payment.findUnique({ where: { id: paymentId } })
  if (!payment || payment.status !== 'PAID') return
  const meta = parsePaymentMetadata(payment.metadataJson)
  const split = readSplitPayMeta(meta)
  // Released wallet rail went back to the athlete — only the IPG charge was actually collected.
  if (!split || split.walletDebitReleased || split.splitFullAmount <= payment.amount) return
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
