import type { Prisma } from '@prisma/client'
import { parsePaymentMetadata } from '#shared/cancelRefund.ts'
import { readSplitPayMeta } from '#shared/splitPay.ts'
import { creditWallet, debitWallet } from './wallet'
import { prisma } from './prisma'

const SPLIT_RECOLLECT_NOTE = 'split-pay-recollect'

export class SplitRecollectError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SplitRecollectError'
  }
}

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
  // A released wallet rail must be recollected before PAID. Never inflate a
  // still-released split into the full court price (that confirms unpaid share).
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

function isInsufficientWallet(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const status = (err as { statusCode?: number }).statusCode
  const message = String((err as { statusMessage?: string }).statusMessage || (err as Error).message || '')
  return status === 409 || /insufficient/i.test(message)
}

/**
 * Take the wallet share back after a release, before this payment may become PAID.
 * Uses ADJUSTMENT because the original PAYMENT_DEBIT row is still unique on the payment.
 * Idempotent on (payment, note). Throws SplitRecollectError when the balance is gone
 * or the payer cannot be resolved — caller must not confirm the booking.
 */
export async function recollectReleasedSplitWallet(paymentId: string, db: DbClient = prisma) {
  const payment = await db.payment.findUnique({ where: { id: paymentId } })
  if (!payment) return { needed: false as const }
  const meta = parsePaymentMetadata(payment.metadataJson)
  const split = readSplitPayMeta(meta)
  if (!split?.walletDebitReleased || split.walletDebitAmount <= 0) {
    return { needed: false as const }
  }

  const userId = payment.userId
    || (typeof meta.walletUserId === 'string' ? meta.walletUserId : null)
    || (payment.bookingId
      ? (await db.booking.findUnique({ where: { id: payment.bookingId }, select: { userId: true } }))?.userId
      : null)
  if (!userId) throw new SplitRecollectError('SPLIT_RECOLLECT_NO_USER')

  const wallet = await db.wallet.findUnique({ where: { userId }, select: { id: true } })
  if (wallet) {
    const existing = await db.walletTransaction.findFirst({
      where: {
        walletId: wallet.id,
        paymentId: payment.id,
        type: 'ADJUSTMENT',
        note: SPLIT_RECOLLECT_NOTE,
      },
      select: { id: true },
    })
    if (existing) return { needed: true as const, recollected: true as const }
  }

  try {
    await debitWallet(userId, split.walletDebitAmount, {
      type: 'ADJUSTMENT',
      paymentId: payment.id,
      bookingId: payment.bookingId || undefined,
      note: SPLIT_RECOLLECT_NOTE,
    }, db)
  } catch (err) {
    if (isInsufficientWallet(err)) throw new SplitRecollectError('SPLIT_RECOLLECT_INSUFFICIENT')
    throw err
  }
  return { needed: true as const, recollected: true as const }
}
