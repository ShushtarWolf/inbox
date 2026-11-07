import type { Prisma } from '@prisma/client'
import { enqueueMoneyJobsForPaidPayment } from './moneyJobs'

/** Statuses a verify may move to PAID. REFUNDED and SUPERSEDED are never in this list. */
export const PAYABLE_TO_PAID_STATUSES = ['PENDING_ONLINE', 'FAILED'] as const

export async function claimPaymentPaid(
  tx: Prisma.TransactionClient,
  paymentId: string,
  data: {
    metadataJson: string
    /** Set when a real SEP RefNum is bound. Omit for the simulated gateway. */
    gatewayRef?: string | null
  },
) {
  const gatewayRef = data.gatewayRef?.trim() || null
  const claimed = await tx.payment.updateMany({
    where: {
      id: paymentId,
      status: { in: [...PAYABLE_TO_PAID_STATUSES] },
      ...(gatewayRef
        ? { OR: [{ gatewayRef: null }, { gatewayRef }] }
        : {}),
    },
    data: {
      status: 'PAID',
      method: 'IPG',
      metadataJson: data.metadataJson,
      ...(gatewayRef ? { gatewayRef } : {}),
    },
  })
  const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } })
  if (claimed.count === 1) {
    await enqueueMoneyJobsForPaidPayment(payment.id, tx)
  }
  return { claimed: claimed.count === 1, payment }
}
