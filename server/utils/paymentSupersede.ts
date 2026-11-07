import type { Prisma } from '@prisma/client'
import { parsePaymentMetadata } from '#shared/cancelRefund.ts'
import { isPaymentPayableOnline } from '#shared/bookingPayment.ts'
import {
  isReversedCaptureReadyToReplace,
  shouldPreserveUnsettledCapture,
} from '#shared/paymentInFlight.ts'
import { prisma } from './prisma'
import { releaseSplitWalletDebit } from './splitPayWallet'

type PayablePayment = {
  id: string
  providerRef?: string | null
  metadataJson: string | null
}

const SUPERSEDE_STATUSES = ['PENDING_ONLINE', 'PAY_AT_CLUB', 'PENDING_AT_CLUB', 'FAILED'] as const

export type SupersedeResult = {
  superseded: boolean
  status: string
}

/**
 * Retire a payable IPG row for checkout retry without deleting history.
 * The row is locked and the status claim is conditional, so a callback that
 * already marked PAID / REFUNDED cannot be overwritten.
 * In-flight verifies keep their bank ref. A finished reverse may still be replaced.
 * providerRef is cleared only after the claim so a late callback 404s.
 */
export async function supersedePayablePaymentForRetry(
  payment: PayablePayment,
  db: typeof prisma | Prisma.TransactionClient = prisma,
): Promise<SupersedeResult> {
  const run = async (tx: Prisma.TransactionClient): Promise<SupersedeResult> => {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${payment.id} FOR UPDATE`
    const fresh = await tx.payment.findUnique({
      where: { id: payment.id },
      select: { status: true, metadataJson: true, gatewayRef: true, providerRef: true },
    })
    if (!fresh) return { superseded: false, status: 'MISSING' }
    const captured = shouldPreserveUnsettledCapture(fresh)
      && !isReversedCaptureReadyToReplace(fresh.metadataJson)
    if (!isPaymentPayableOnline(fresh.status) || captured) {
      return { superseded: false, status: fresh.status }
    }

    await releaseSplitWalletDebit(payment.id, tx)
    const afterRelease = await tx.payment.findUnique({
      where: { id: payment.id },
      select: { metadataJson: true, providerRef: true },
    })
    const meta = parsePaymentMetadata(afterRelease?.metadataJson ?? fresh.metadataJson)
    const providerRef = afterRelease?.providerRef || fresh.providerRef || payment.providerRef
    const claimed = await tx.payment.updateMany({
      where: {
        id: payment.id,
        status: { in: [...SUPERSEDE_STATUSES] },
      },
      data: {
        status: 'SUPERSEDED',
        bookingId: null,
        coachSessionId: null,
        packageBookingId: null,
        providerRef: null,
        metadataJson: JSON.stringify({
          ...meta,
          ...(providerRef ? { supersededProviderRef: providerRef } : {}),
          supersededAt: new Date().toISOString(),
        }),
      },
    })
    if (claimed.count !== 1) {
      const raced = await tx.payment.findUnique({ where: { id: payment.id }, select: { status: true } })
      throw new Error(`SUPERSEDE_LOST:${raced?.status || 'UNKNOWN'}`)
    }
    return { superseded: true, status: 'SUPERSEDED' }
  }

  if (db === prisma) return prisma.$transaction(run)
  return run(db as Prisma.TransactionClient)
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
