#!/usr/bin/env node
/**
 * Append-only: credit missing series session REFUND_CREDIT rows when
 * sessionRefundsTotal > sum(REFUND_CREDIT) for a payment.
 *
 *   node scripts/correct-series-refund-gaps.mjs           # dry run
 *   APPLY=yes node scripts/correct-series-refund-gaps.mjs # write
 */
import { PrismaClient } from '@prisma/client'

const APPLY = process.env.APPLY === 'yes'
const prisma = new PrismaClient()

async function main() {
  const rows = await prisma.$queryRaw`
    SELECT p.id AS "paymentId", p.amount, p."bookingId", p."userId",
           COALESCE((p."metadataJson"::jsonb->>'sessionRefundsTotal')::int, 0) AS "sessionRefundsTotal",
           COALESCE((
             SELECT SUM(wt.amount)::int
             FROM "WalletTransaction" wt
             WHERE wt."paymentId" = p.id AND wt.type = 'REFUND_CREDIT'
           ), 0) AS "refundCreditSum"
    FROM "Payment" p
    WHERE p."metadataJson" IS NOT NULL
      AND p."metadataJson"::jsonb ? 'sessionRefundsTotal'
      AND COALESCE((p."metadataJson"::jsonb->>'sessionRefundsTotal')::int, 0) > 0
      AND p."userId" IS NOT NULL
  `

  const gaps = rows.filter((r) => Number(r.sessionRefundsTotal) > Number(r.refundCreditSum))
  console.log(`Series payments with refund gaps: ${gaps.length}`)
  for (const row of gaps) {
    const missing = Number(row.sessionRefundsTotal) - Number(row.refundCreditSum)
    console.log(
      `  payment=${row.paymentId} user=${row.userId} meta=${row.sessionRefundsTotal} credited=${row.refundCreditSum} missing=${missing}`,
    )
  }

  if (!APPLY) {
    console.log('\nDry run — no changes. Run with APPLY=yes after a local DB dump.')
    await prisma.$disconnect()
    return
  }

  for (const row of gaps) {
    const missing = Number(row.sessionRefundsTotal) - Number(row.refundCreditSum)
    if (missing <= 0 || !row.userId) continue
    await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.upsert({
        where: { userId: row.userId },
        update: {},
        create: { userId: row.userId },
      })
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { increment: missing },
          availableBalance: { increment: missing },
        },
      })
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: missing,
          type: 'ADJUSTMENT',
          paymentId: row.paymentId,
          bookingId: row.bookingId,
          note: 'Correction: series refund gap (sessionRefundsTotal vs REFUND_CREDIT)',
        },
      })
    })
    console.log(`  credited ${missing} to user ${row.userId} for payment ${row.paymentId}`)
  }
  console.log('\nDone.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
