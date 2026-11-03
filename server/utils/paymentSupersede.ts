import type { Prisma } from '@prisma/client'
import { parsePaymentMetadata } from '#shared/cancelRefund.ts'
import { prisma } from './prisma'
import { releaseSplitWalletDebit } from './splitPayWallet'

type PayablePayment = {
  id: string
  providerRef?: string | null
  metadataJson: string | null
}

/**
 * Retire a payable IPG row for checkout retry without deleting history.
 * Clears parent FKs so a new Payment can claim booking/session/package.
 * Split-pay wallet debit is returned first — nothing else scans SUPERSEDED rows.
 * providerRef is cleared so a late SEP callback 404s (unverified → bank auto-reverses).
 */
export async function supersedePayablePaymentForRetry(
  payment: PayablePayment,
  db: typeof prisma | Prisma.TransactionClient = prisma,
) {
  const run = async (tx: Prisma.TransactionClient) => {
    await releaseSplitWalletDebit(payment.id, tx)
    const fresh = await tx.payment.findUnique({
      where: { id: payment.id },
      select: { metadataJson: true },
    })
    const meta = parsePaymentMetadata(fresh?.metadataJson ?? payment.metadataJson)
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUPERSEDED',
        bookingId: null,
        coachSessionId: null,
        packageBookingId: null,
        providerRef: null,
        metadataJson: JSON.stringify({
          ...meta,
          ...(payment.providerRef ? { supersededProviderRef: payment.providerRef } : {}),
          supersededAt: new Date().toISOString(),
        }),
      },
    })
  }

  if (db === prisma) {
    await prisma.$transaction(run)
    return
  }
  await run(db as Prisma.TransactionClient)
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
