import { parsePaymentMetadata } from '#shared/cancelRefund.ts'
import { markMoneyJobsDoneForPaidPayment } from './moneyJobs'
import { prisma } from './prisma'
import { creditWalletForTopUpPayment } from './wallet'

/**
 * PAID top-ups with null userId (pre-auth bugs / user SetNull) never get TOPUP_CREDIT.
 * Recover userId from another payment that shares the same SEP maskedPan, then credit.
 */
export async function healOrphanTopUpPayments(limit = 20) {
  const orphans = await prisma.$queryRaw<Array<{
    id: string
    amount: number
    metadataJson: string | null
  }>>`
    SELECT p.id, p.amount, p."metadataJson"
    FROM "Payment" p
    WHERE p.status = 'PAID' AND p.purpose = 'topup' AND p."userId" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "WalletTransaction" t
        WHERE t."paymentId" = p.id AND t.type = 'TOPUP_CREDIT'
      )
    ORDER BY p."createdAt" ASC
    LIMIT ${limit}
  `

  const results: Array<{ paymentId: string, ok: boolean, reason: string, userId?: string }> = []

  for (const row of orphans) {
    const meta = parsePaymentMetadata(row.metadataJson)
    const pan = typeof meta.maskedPan === 'string' ? meta.maskedPan.trim() : ''
    if (!pan) {
      results.push({ paymentId: row.id, ok: false, reason: 'no_masked_pan' })
      continue
    }

    const donor = await prisma.payment.findFirst({
      where: {
        userId: { not: null },
        metadataJson: { contains: `"maskedPan":"${pan}"` },
      },
      select: { userId: true },
      orderBy: { createdAt: 'desc' },
    })
    if (!donor?.userId) {
      results.push({ paymentId: row.id, ok: false, reason: 'no_pan_match' })
      continue
    }

    await prisma.payment.update({
      where: { id: row.id },
      data: { userId: donor.userId },
    })

    const credit = await creditWalletForTopUpPayment(row.id, 'PENDING_ONLINE')
    const ok = credit.credited || credit.reason === 'already_credited'
    if (ok) await markMoneyJobsDoneForPaidPayment(row.id)
    results.push({
      paymentId: row.id,
      ok,
      reason: credit.credited ? 'credited' : credit.reason,
      userId: donor.userId,
    })
  }

  return {
    scanned: orphans.length,
    healed: results.filter((r) => r.ok).length,
    results,
  }
}
