import { parsePaymentMetadata } from '#shared/cancelRefund.ts'
import { claimPaymentPaid } from './paymentClaim'
import { enqueueMoneyJobsForPaidPayment, markMoneyJobsDoneForPaidPayment } from './moneyJobs'
import { runPaidBookkeepingThenNotify, syncCompetitionEntryOnPayment, syncPaymentToParent } from './paymentSync'
import { creditOwnerForPaidPayment } from './settlement'

export type ZeroAmountCheckoutResult = {
  payment: {
    id: string
    amount: number
    status: string
    provider: string
    method: string | null
  }
  claimedNow: boolean
}

/** Confirm a payable row with server-computed amount 0 — no SEP, no wallet debit. */
export async function confirmZeroAmountCheckout(opts: {
  paymentId: string
  bookingId?: string
  existingMetadataJson?: string | null
  previousStatus: string
}): Promise<ZeroAmountCheckoutResult> {
  const baseMeta = parsePaymentMetadata(opts.existingMetadataJson)
  const paidMeta = {
    ...baseMeta,
    zeroAmountCheckout: true,
    gatewayCaptured: true,
    confirmedAt: new Date().toISOString(),
  }

  const { payment, claimedNow } = await prisma.$transaction(async (tx) => {
    if (opts.bookingId) {
      const parent = await tx.booking.updateMany({
        where: { id: opts.bookingId, status: { not: 'CANCELLED' } },
        data: { paymentStatus: 'PAID', paymentMethod: 'IPG' },
      })
      if (parent.count !== 1) {
        throw createError({ statusCode: 409, statusMessage: 'HOLD_EXPIRED' })
      }
    }

    const claimed = await claimPaymentPaid(tx, opts.paymentId, {
      metadataJson: JSON.stringify(paidMeta),
      gatewayRef: null,
    })
    if (!claimed.claimed && claimed.payment.status !== 'PAID') {
      throw createError({ statusCode: 409, statusMessage: 'PAYMENT_NOT_PAYABLE' })
    }
    return { payment: claimed.payment, claimedNow: claimed.claimed }
  })

  const previousStatus = opts.previousStatus
  await runPaidBookkeepingThenNotify(payment.id, previousStatus, async () => {
    await syncPaymentToParent(payment.id)
    await syncCompetitionEntryOnPayment(payment.id)
    await enqueueMoneyJobsForPaidPayment(payment.id)
    await creditOwnerForPaidPayment(payment.id, claimedNow ? previousStatus : 'PAID')
    await markMoneyJobsDoneForPaidPayment(payment.id)
  }, { notify: claimedNow })

  return {
    payment: {
      id: payment.id,
      amount: payment.amount,
      status: payment.status,
      provider: payment.provider,
      method: payment.method,
    },
    claimedNow,
  }
}