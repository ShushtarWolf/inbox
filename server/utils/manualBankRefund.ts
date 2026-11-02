import { createError } from 'h3'
import {
  buildManualBankRefundReturnedMetadata,
  isManualBankRefundOwed,
  parsePaymentMetadata,
  readManualBankRefund,
} from '#shared/cancelRefund.ts'
import { isValidSheba } from '#shared/settlement.ts'
import { syncPaymentToParent } from './paymentSync'
import { prisma } from './prisma'

/**
 * Admin acknowledges that a pay-link guest IPG cancel was bank-refunded manually.
 * Clears manualBankRefund owed so overview/audit counts drop.
 */
export async function acknowledgeManualBankRefund(options: {
  paymentId: string
  note?: string
  guestSheba?: string | null
}) {
  const payment = await prisma.payment.findUnique({ where: { id: options.paymentId } })
  if (!payment) {
    throw createError({ statusCode: 404, statusMessage: 'Payment not found' })
  }
  if (payment.status !== 'REFUNDED') {
    throw createError({ statusCode: 409, statusMessage: 'Payment is not in REFUNDED state' })
  }

  const meta = parsePaymentMetadata(payment.metadataJson)
  const current = readManualBankRefund(meta)
  if (current === 'returned') {
    return { ok: true as const, already: true as const, paymentId: payment.id }
  }
  if (!isManualBankRefundOwed(meta)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Payment is not awaiting manual bank refund acknowledgment',
    })
  }

  const rawSheba = options.guestSheba?.trim() || null
  if (rawSheba && !isValidSheba(rawSheba)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid SHEBA' })
  }

  const next = buildManualBankRefundReturnedMetadata(meta, {
    note: options.note,
    guestSheba: rawSheba,
  })
  await prisma.payment.update({
    where: { id: payment.id },
    data: { metadataJson: JSON.stringify(next) },
  })
  await syncPaymentToParent(payment.id)
  return { ok: true as const, already: false as const, paymentId: payment.id }
}
