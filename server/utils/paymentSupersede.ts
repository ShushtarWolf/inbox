import type { Prisma } from '@prisma/client'
import { parsePaymentMetadata } from '#shared/cancelRefund.ts'
import { prisma } from './prisma'

type PayablePayment = {
  id: string
  bookingId: string | null
  coachSessionId: string | null
  packageBookingId: string | null
  metadataJson: string | null
}

/**
 * Retire a payable IPG row for checkout retry without deleting history.
 * Clears parent FKs so a new Payment can claim booking/session/package.
 */
export async function supersedePayablePaymentForRetry(
  payment: PayablePayment,
  db: typeof prisma | Prisma.TransactionClient = prisma,
) {
  const meta = parsePaymentMetadata(payment.metadataJson)
  await db.payment.update({
    where: { id: payment.id },
    data: {
      status: 'SUPERSEDED',
      bookingId: null,
      coachSessionId: null,
      packageBookingId: null,
      providerRef: null,
      metadataJson: JSON.stringify({
        ...meta,
        supersededAt: new Date().toISOString(),
      }),
    },
  })
}

/** Link superseded row to its replacement after the new payable is created. */
export async function linkPaymentSupersededBy(
  supersededPaymentId: string,
  replacementPaymentId: string,
  db: typeof prisma | Prisma.TransactionClient = prisma,
) {
  await db.payment.update({
    where: { id: supersededPaymentId },
    data: { supersededByPaymentId: replacementPaymentId },
  })
}
