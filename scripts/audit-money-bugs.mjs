#!/usr/bin/env node
/**
 * Read-only audit for known wallet/settlement money bugs.
 * Never writes. Prints counts and sample IDs for ops review.
 *
 *   node scripts/audit-money-bugs.mjs
 *
 * Before any correction script or migration against a shared DB:
 *   1. Run this audit
 *   2. Take a local DB dump (backups/ or gh workflow backup-db.yml)
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function section(title) {
  console.log(`\n=== ${title} ===`)
}

async function main() {
  console.log('Money-bug audit (read-only). No rows will be modified.')

  section('1) Open CASH settlements (desk cash credited to withdrawable wallet)')
  const cashSettlements = await prisma.$queryRaw`
    SELECT s.id, s."paymentId", s."clubId", s."coachId", s."ownerNet", s."classDate", s."clawedBackAt",
           p.method, p.amount AS "paymentAmount", p.status
    FROM "SettlementLedgerEntry" s
    JOIN "Payment" p ON p.id = s."paymentId"
    WHERE p.method = 'CASH'
      AND s."clawedBackAt" IS NULL
    ORDER BY s."createdAt" ASC
    LIMIT 200
  `
  const cashSettlementCount = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS n
    FROM "SettlementLedgerEntry" s
    JOIN "Payment" p ON p.id = s."paymentId"
    WHERE p.method = 'CASH'
      AND s."clawedBackAt" IS NULL
  `
  console.log(`Open CASH settlements: ${cashSettlementCount[0]?.n ?? 0}`)
  console.log(`Sample (up to 200):`)
  for (const row of cashSettlements) {
    console.log(
      `  entry=${row.id} payment=${row.paymentId} net=${row.ownerNet} club=${row.clubId || '-'} coach=${row.coachId || '-'}`,
    )
  }

  section('2) Series refund gaps (sessionRefundsTotal vs REFUND_CREDIT sum)')
  const seriesGaps = await prisma.$queryRaw`
    SELECT p.id AS "paymentId", p.amount, p."bookingId",
           COALESCE((p."metadataJson"::jsonb->>'sessionRefundsTotal')::int, 0) AS "sessionRefundsTotal",
           COALESCE((
             SELECT SUM(wt.amount)::int
             FROM "WalletTransaction" wt
             WHERE wt."paymentId" = p.id AND wt.type = 'REFUND_CREDIT'
           ), 0) AS "refundCreditSum",
           (
             SELECT COUNT(*)::int
             FROM "WalletTransaction" wt
             WHERE wt."paymentId" = p.id AND wt.type = 'REFUND_CREDIT'
           ) AS "refundCreditRows"
    FROM "Payment" p
    WHERE p."metadataJson" IS NOT NULL
      AND p."metadataJson"::jsonb ? 'sessionRefundsTotal'
      AND COALESCE((p."metadataJson"::jsonb->>'sessionRefundsTotal')::int, 0) > 0
    ORDER BY p."createdAt" DESC
    LIMIT 200
  `
  const gapRows = seriesGaps.filter((r) => Number(r.sessionRefundsTotal) > Number(r.refundCreditSum))
  console.log(`Series payments with sessionRefundsTotal > REFUND_CREDIT sum: ${gapRows.length} (of ${seriesGaps.length} sampled)`)
  for (const row of gapRows.slice(0, 50)) {
    console.log(
      `  payment=${row.paymentId} metaTotal=${row.sessionRefundsTotal} credited=${row.refundCreditSum} rows=${row.refundCreditRows}`,
    )
  }

  section('3) Withdrawable leak candidates (settlement net vs holds)')
  const userLeak = await prisma.$queryRaw`
    WITH settle AS (
      SELECT w.id AS "walletId", w.balance, w."userId",
             COALESCE(SUM(CASE WHEN wt.type = 'SETTLEMENT_CREDIT' THEN wt.amount ELSE 0 END), 0)::int AS credits,
             COALESCE(SUM(CASE WHEN wt.type = 'SETTLEMENT_CLAWBACK' THEN wt.amount ELSE 0 END), 0)::int AS clawbacks,
             COALESCE(SUM(CASE WHEN wt.type = 'WITHDRAW_HOLD' THEN -wt.amount ELSE 0 END), 0)::int AS holds,
             COALESCE(SUM(CASE WHEN wt.type = 'WITHDRAW_RELEASE' THEN wt.amount ELSE 0 END), 0)::int AS releases
      FROM "Wallet" w
      LEFT JOIN "WalletTransaction" wt ON wt."walletId" = w.id
      GROUP BY w.id, w.balance, w."userId"
    )
    SELECT "walletId", "userId", balance, credits, clawbacks, holds, releases,
           (credits + clawbacks) AS "settlementNet",
           GREATEST(0, (credits + clawbacks) - (holds - releases)) AS "settlementRemaining",
           LEAST(balance, GREATEST(0, credits + clawbacks)) AS "oldWithdrawable"
    FROM settle
    WHERE balance > 0
      AND (credits + clawbacks) > 0
      AND LEAST(balance, GREATEST(0, credits + clawbacks))
          > GREATEST(0, (credits + clawbacks) - (holds - releases))
    ORDER BY balance DESC
    LIMIT 100
  `
  console.log(`User wallets where old formula > settlement remaining after holds: ${userLeak.length}`)
  for (const row of userLeak.slice(0, 30)) {
    console.log(
      `  wallet=${row.walletId} user=${row.userId} bal=${row.balance} oldW=${row.oldWithdrawable} remain=${row.settlementRemaining}`,
    )
  }

  const clubLeak = await prisma.$queryRaw`
    WITH settle AS (
      SELECT w.id AS "walletId", w.balance, w."clubId",
             COALESCE(SUM(CASE WHEN wt.type = 'BOOKING_CREDIT' THEN wt.amount ELSE 0 END), 0)::int AS credits,
             COALESCE(SUM(CASE WHEN wt.type = 'CLAWBACK' THEN -wt.amount ELSE 0 END), 0)::int AS clawbackAbs,
             COALESCE(SUM(CASE WHEN wt.type = 'WITHDRAW_HOLD' THEN -wt.amount ELSE 0 END), 0)::int AS holds,
             COALESCE(SUM(CASE WHEN wt.type = 'WITHDRAW_RELEASE' THEN wt.amount ELSE 0 END), 0)::int AS releases
      FROM "ClubWallet" w
      LEFT JOIN "ClubWalletTransaction" wt ON wt."walletId" = w.id
      GROUP BY w.id, w.balance, w."clubId"
    )
    SELECT "walletId", "clubId", balance, credits, clawbackAbs, holds, releases
    FROM settle
    WHERE balance > 0 AND credits > 0
      AND LEAST(balance, GREATEST(0, credits - clawbackAbs))
          > GREATEST(0, (credits - clawbackAbs) - (holds - releases))
    ORDER BY balance DESC
    LIMIT 100
  `
  console.log(`Club wallets with possible withdrawable leak: ${clubLeak.length}`)
  for (const row of clubLeak.slice(0, 30)) {
    console.log(`  clubWallet=${row.walletId} club=${row.clubId} bal=${row.balance} holds=${row.holds}`)
  }

  section('4) Pending withdraw requests')
  const [pendingUser, pendingClub] = await Promise.all([
    prisma.userWithdrawRequest.count({ where: { status: 'PENDING' } }),
    prisma.withdrawRequest.count({ where: { status: 'PENDING' } }),
  ])
  console.log(`Pending user withdraws: ${pendingUser}`)
  console.log(`Pending club withdraws: ${pendingClub}`)

  section('Dump gate')
  console.log('Before APPLY=yes correction scripts or migrate deploy on shared/prod DB:')
  console.log('  - Keep a local dump under backups/ (gh workflow backup-db.yml or liara db backup download)')
  console.log('  - Re-run this audit after corrections to confirm counts drop to 0 / expected')
  console.log('\nAudit complete.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
