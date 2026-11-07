import type { Prisma } from '@prisma/client'
import { parsePaymentMetadata } from '#shared/cancelRefund.ts'
import {
  WALLET_FIRST_BOOKING_DEBIT_NOTE,
  WALLET_FIRST_CARD_RETURN_NOTE,
  WALLET_FIRST_INFLOW_NOTE,
} from '#shared/walletFirstHistorical.ts'
import { planLiveWalletFirstIpg } from '#shared/walletFirstIpg.ts'
import { creditWallet, debitWallet } from './wallet'

type Tx = Prisma.TransactionClient

export async function applyWalletFirstForConfirmedIpg(tx: Tx, paymentId: string) {
  const payment = await tx.payment.findUnique({ where: { id: paymentId } })
  if (!payment || payment.status !== 'PAID') return { status: 'not_paid' as const }
  const metadata = parsePaymentMetadata(payment.metadataJson)
  const booking = payment.bookingId
    ? await tx.booking.findUnique({ where: { id: payment.bookingId }, select: { userId: true } })
    : null
  const plan = planLiveWalletFirstIpg({
    purpose: payment.purpose,
    method: payment.method,
    provider: payment.provider,
    amount: payment.amount,
    metadata,
    paymentUserId: payment.userId,
    bookingUserId: booking?.userId,
  })
  if (plan.action === 'skip') return { status: plan.reason }
  if (plan.action === 'unresolved') {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        metadataJson: JSON.stringify({
          ...metadata,
          walletFirstStatus: plan.reason,
        }),
      },
    })
    return { status: plan.reason }
  }

  const existing = await tx.walletTransaction.findMany({
    where: { paymentId: payment.id, type: { in: ['IPG_BOOKING_CREDIT', 'IPG_BOOKING_DEBIT'] } },
    select: { type: true },
  })
  const haveCredit = existing.some((row) => row.type === 'IPG_BOOKING_CREDIT')
  const haveDebit = existing.some((row) => row.type === 'IPG_BOOKING_DEBIT')
  if (haveCredit && haveDebit) return { status: 'already' as const, amount: plan.amount, userId: plan.userId }
  if (haveCredit !== haveDebit) {
    throw new Error('WALLET_FIRST_PARTIAL')
  }

  await creditWallet(plan.userId, plan.amount, {
    type: 'IPG_BOOKING_CREDIT',
    paymentId: payment.id,
    bookingId: payment.bookingId || undefined,
    note: `${WALLET_FIRST_INFLOW_NOTE}:${payment.id}`,
  }, tx)
  await debitWallet(plan.userId, plan.amount, {
    type: 'IPG_BOOKING_DEBIT',
    paymentId: payment.id,
    bookingId: payment.bookingId || undefined,
    note: `${WALLET_FIRST_BOOKING_DEBIT_NOTE}:${payment.id}`,
  }, tx)
  await tx.payment.update({
    where: { id: payment.id },
    data: {
      metadataJson: JSON.stringify({
        ...metadata,
        walletFirstStatus: 'applied',
        walletFirstAmount: plan.amount,
        walletFirstUserId: plan.userId,
      }),
    },
  })
  return { status: 'applied' as const, amount: plan.amount, userId: plan.userId }
}

export async function applyHistoricalWalletFirstPair(
  tx: Tx,
  input: {
    userId: string
    paymentId: string
    bookingId?: string | null
    amount: number
    debitType: 'IPG_BOOKING_DEBIT' | 'IPG_RETURNED_TO_CARD'
    inflowAt?: Date | null
    outflowAt?: Date | null
  },
) {
  const debitNote = input.debitType === 'IPG_RETURNED_TO_CARD'
    ? WALLET_FIRST_CARD_RETURN_NOTE
    : WALLET_FIRST_BOOKING_DEBIT_NOTE
  await creditWallet(input.userId, input.amount, {
    type: 'IPG_BOOKING_CREDIT',
    paymentId: input.paymentId,
    bookingId: input.bookingId || undefined,
    note: `${WALLET_FIRST_INFLOW_NOTE}:${input.paymentId}`,
    originalEventAt: input.inflowAt ?? null,
  }, tx)
  await debitWallet(input.userId, input.amount, {
    type: input.debitType,
    paymentId: input.paymentId,
    bookingId: input.bookingId || undefined,
    note: `${debitNote}:${input.paymentId}`,
    originalEventAt: input.outflowAt ?? null,
  }, tx)
}
