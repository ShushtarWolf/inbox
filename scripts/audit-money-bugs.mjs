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
 *
 * Exit 1 when PAID amount=0 coveredByBookingId siblings exist AND any live
 * code path still uses `payment…amount || listPrice` (sibling zeros become
 * phantom court/session list prices). §9 always prints the SQL exposure.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function section(title) {
  console.log(`\n=== ${title} ===`)
}

/**
 * Live `payment?.amount || listPrice` (or slot/session price) coerce — turns
 * covered sibling zeros into phantom income. Ban-comments and *.test.* excluded.
 */
function findUnsafeAmountOrListPricePaths() {
  const roots = ['server', 'shared', 'app']
  const skipDir = /(?:^|\/)(?:\.|node_modules|__tests__)(?:\/|$)/
  const skipFile = /\.(?:test|spec)\.[^.]+$/
  // payment.amount || listPrice / slot.price / session.price / recomputed…
  const bad = /\b(?:payment\s*\?\.\s*)?amount\s*\|\|\s*(?:listPrice|slot\.price|session\.price|recomputed\w*|amount\b|price\b)/
  const hits = []

  function walk(dir) {
    let entries
    try {
      entries = readdirSync(dir)
    }
    catch {
      return
    }
    for (const name of entries) {
      const full = join(dir, name)
      const rel = relative(REPO_ROOT, full)
      if (skipDir.test(rel)) continue
      let st
      try {
        st = statSync(full)
      }
      catch {
        continue
      }
      if (st.isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.(ts|js|mjs|vue)$/.test(name) || skipFile.test(name)) continue
      const text = readFileSync(full, 'utf8')
      const lines = text.split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const trimmed = line.trim()
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('<!--')) continue
        // JSDoc / block ban text: Never `payment?.amount || listPrice`
        if (/Never\s+`[^`]*amount\s*\|\|/i.test(line)) continue
        if (!bad.test(line)) continue
        hits.push({ file: rel, line: i + 1, text: trimmed.slice(0, 160) })
      }
    }
  }

  for (const root of roots) walk(join(REPO_ROOT, root))
  return hits
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

  section('5) Wallet balance drift (stored balance vs Σ signed txs − paid withdraws)')
  // HOLD/RELEASE/LOCK/UNLOCK/WITHDRAW_PAID do not carry signed total-balance deltas.
  const userDrift = await prisma.$queryRaw`
    WITH signed AS (
      SELECT wt."walletId",
             COALESCE(SUM(wt.amount) FILTER (
               WHERE wt.type NOT IN ('WITHDRAW_HOLD','WITHDRAW_RELEASE','LOCK','UNLOCK','WITHDRAW_PAID')
             ), 0)::int AS signed_sum
      FROM "WalletTransaction" wt
      GROUP BY wt."walletId"
    ),
    paid AS (
      SELECT uwr."userId", COALESCE(SUM(uwr.amount), 0)::int AS paid_sum
      FROM "UserWithdrawRequest" uwr
      WHERE uwr.status = 'PAID'
      GROUP BY uwr."userId"
    )
    SELECT w.id AS "walletId", w."userId", w.balance,
           COALESCE(s.signed_sum, 0) AS "signedSum",
           COALESCE(p.paid_sum, 0) AS "withdrawPaid",
           w.balance - (COALESCE(s.signed_sum, 0) - COALESCE(p.paid_sum, 0)) AS drift
    FROM "Wallet" w
    LEFT JOIN signed s ON s."walletId" = w.id
    LEFT JOIN paid p ON p."userId" = w."userId"
    WHERE w.balance - (COALESCE(s.signed_sum, 0) - COALESCE(p.paid_sum, 0)) <> 0
    ORDER BY ABS(w.balance - (COALESCE(s.signed_sum, 0) - COALESCE(p.paid_sum, 0))) DESC
    LIMIT 50
  `
  console.log(`User wallets with balance drift: ${userDrift.length}`)
  for (const row of userDrift.slice(0, 30)) {
    console.log(
      `  wallet=${row.walletId} user=${row.userId} bal=${row.balance} signed=${row.signedSum} paidOut=${row.withdrawPaid} drift=${row.drift}`,
    )
  }

  const clubDrift = await prisma.$queryRaw`
    WITH signed AS (
      SELECT wt."walletId",
             COALESCE(SUM(wt.amount) FILTER (
               WHERE wt.type NOT IN ('WITHDRAW_HOLD','WITHDRAW_RELEASE','LOCK','UNLOCK','WITHDRAW_PAID')
             ), 0)::int AS signed_sum
      FROM "ClubWalletTransaction" wt
      GROUP BY wt."walletId"
    ),
    paid AS (
      SELECT wr."clubId", COALESCE(SUM(wr.amount), 0)::int AS paid_sum
      FROM "WithdrawRequest" wr
      WHERE wr.status = 'PAID'
      GROUP BY wr."clubId"
    )
    SELECT w.id AS "walletId", w."clubId", w.balance,
           COALESCE(s.signed_sum, 0) AS "signedSum",
           COALESCE(p.paid_sum, 0) AS "withdrawPaid",
           w.balance - (COALESCE(s.signed_sum, 0) - COALESCE(p.paid_sum, 0)) AS drift
    FROM "ClubWallet" w
    LEFT JOIN signed s ON s."walletId" = w.id
    LEFT JOIN paid p ON p."clubId" = w."clubId"
    WHERE w.balance - (COALESCE(s.signed_sum, 0) - COALESCE(p.paid_sum, 0)) <> 0
    ORDER BY ABS(w.balance - (COALESCE(s.signed_sum, 0) - COALESCE(p.paid_sum, 0))) DESC
    LIMIT 50
  `
  console.log(`Club wallets with balance drift: ${clubDrift.length}`)
  for (const row of clubDrift.slice(0, 30)) {
    console.log(
      `  clubWallet=${row.walletId} club=${row.clubId} bal=${row.balance} signed=${row.signedSum} paidOut=${row.withdrawPaid} drift=${row.drift}`,
    )
  }

  section('6) REFUNDED payments whose settlement was never clawed back (club/coach still holds net)')
  const openOnRefunded = await prisma.$queryRaw`
    SELECT s.id, s."paymentId", s."clubId", s."coachId", s."ownerNet"
    FROM "SettlementLedgerEntry" s
    JOIN "Payment" p ON p.id = s."paymentId"
    WHERE p.status = 'REFUNDED'
      AND s."clawedBackAt" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "ClubWalletTransaction" c
        WHERE c."paymentId" = s."paymentId" AND c.type = 'CLAWBACK'
      )
      AND NOT EXISTS (
        SELECT 1 FROM "WalletTransaction" w
        WHERE w."paymentId" = s."paymentId" AND w.type = 'SETTLEMENT_CLAWBACK'
      )
    LIMIT 200
  `
  console.log(`Refunded payments with open settlement: ${openOnRefunded.length}`)
  for (const row of openOnRefunded.slice(0, 30)) {
    console.log(`  entry=${row.id} payment=${row.paymentId} net=${row.ownerNet} club=${row.clubId || '-'} coach=${row.coachId || '-'}`)
  }

  section('7) Settlement / wallet rows whose Payment was deleted (old re-book cascade)')
  // Already-clawed orphan settlements are historical debris (payment row gone after
  // old re-book cascade). Only un-clawed orphans are a live money risk.
  const [orphanLedgerOpen, orphanLedgerClawed, orphanWalletTx] = await Promise.all([
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS n FROM "SettlementLedgerEntry" s
      WHERE s."clawedBackAt" IS NULL
        AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p.id = s."paymentId")
    `,
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS n FROM "SettlementLedgerEntry" s
      WHERE s."clawedBackAt" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p.id = s."paymentId")
    `,
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS n FROM "WalletTransaction" w
      WHERE w."paymentId" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p.id = w."paymentId")
    `,
  ])
  console.log(`Orphan settlements still holding net (open): ${orphanLedgerOpen[0]?.n ?? 0}`)
  console.log(`Orphan settlements already clawed (historical): ${orphanLedgerClawed[0]?.n ?? 0}`)
  console.log(`Orphan wallet transactions (payment deleted): ${orphanWalletTx[0]?.n ?? 0}`)

  section('8) Online refunds with no athlete wallet (pay-link guests) — bank refund owed')
  const manualOwed = await prisma.$queryRaw`
    SELECT p.id, p.amount, p.method, p."updatedAt"
    FROM "Payment" p
    WHERE p.status = 'REFUNDED'
      AND p."metadataJson" LIKE '%"manualRefundRequired":true%'
      AND p."metadataJson" NOT LIKE '%"manualBankRefund":"returned"%'
    ORDER BY p."updatedAt" DESC
    LIMIT 100
  `
  console.log(`Manual bank refunds owed: ${manualOwed.length}`)
  for (const row of manualOwed.slice(0, 30)) {
    console.log(`  payment=${row.id} amount=${row.amount} method=${row.method}`)
  }

  section('9) PAID amount=0 + coveredByBookingId siblings (|| listPrice phantom risk)')
  // Legitimate season/multi-slot shape: primary holds the charge; siblings stay 0.
  // Bug is only if code still does payment.amount || listPrice — zeros inflate to slot/session price.
  const siblingAgg = await prisma.$queryRaw`
    SELECT
      COUNT(*)::int AS n,
      COALESCE(SUM(
        CASE
          WHEN p."bookingId" IS NOT NULL THEN COALESCE(s.price, 0)
          WHEN p."coachSessionId" IS NOT NULL THEN COALESCE(cs.price, 0)
          ELSE 0
        END
      ), 0)::int AS "phantomIfOrUsed"
    FROM "Payment" p
    LEFT JOIN "Booking" b ON b.id = p."bookingId"
    LEFT JOIN "Slot" s ON s.id = b."slotId"
    LEFT JOIN "CoachSession" cs ON cs.id = p."coachSessionId"
    WHERE p.status = 'PAID'
      AND p.amount = 0
      AND p."metadataJson" IS NOT NULL
      AND COALESCE(p."metadataJson"::jsonb->>'coveredByBookingId', '') <> ''
  `
  const siblingCount = Number(siblingAgg[0]?.n ?? 0)
  const phantomIfOrUsed = Number(siblingAgg[0]?.phantomIfOrUsed ?? 0)
  // Finance-style estimate: same sum(list price) as if financeIncomeAmount used `||`.
  const financePhantomEstimate = phantomIfOrUsed

  const siblingSamples = await prisma.$queryRaw`
    SELECT p.id AS "paymentId", p."bookingId", p."coachSessionId",
           p."metadataJson"::jsonb->>'coveredByBookingId' AS "coveredByBookingId",
           CASE
             WHEN p."bookingId" IS NOT NULL THEN COALESCE(s.price, 0)
             WHEN p."coachSessionId" IS NOT NULL THEN COALESCE(cs.price, 0)
             ELSE 0
           END::int AS "listPrice"
    FROM "Payment" p
    LEFT JOIN "Booking" b ON b.id = p."bookingId"
    LEFT JOIN "Slot" s ON s.id = b."slotId"
    LEFT JOIN "CoachSession" cs ON cs.id = p."coachSessionId"
    WHERE p.status = 'PAID'
      AND p.amount = 0
      AND p."metadataJson" IS NOT NULL
      AND COALESCE(p."metadataJson"::jsonb->>'coveredByBookingId', '') <> ''
    ORDER BY p."createdAt" DESC
    LIMIT 50
  `

  console.log(`PAID zero coveredByBookingId siblings: ${siblingCount}`)
  console.log(`Phantom if || listPrice used (Σ slot/session.price): ${phantomIfOrUsed}`)
  console.log(`Finance-style phantom estimate (Σ list price): ${financePhantomEstimate}`)
  console.log(`Sample (up to 50):`)
  for (const row of siblingSamples) {
    console.log(
      `  payment=${row.paymentId} booking=${row.bookingId || '-'} session=${row.coachSessionId || '-'} coveredBy=${row.coveredByBookingId} listPrice=${row.listPrice}`,
    )
  }

  const unsafeOrPaths = findUnsafeAmountOrListPricePaths()
  console.log(`Live code paths with payment…amount || listPrice: ${unsafeOrPaths.length}`)
  for (const hit of unsafeOrPaths.slice(0, 30)) {
    console.log(`  ${hit.file}:${hit.line}  ${hit.text}`)
  }

  // Gate: siblings (legitimate) are only dangerous while live || listPrice coerce remains.
  const failOrListPrice = siblingCount > 0 && unsafeOrPaths.length > 0
  if (failOrListPrice) {
    console.log(
      `FAIL: ${siblingCount} paid-zero covered siblings exist AND ${unsafeOrPaths.length} live || listPrice path(s) remain — phantom exposure ${phantomIfOrUsed}`,
    )
  }
  else if (siblingCount > 0) {
    console.log(
      `OK (data shape expected): ${siblingCount} siblings; no live || listPrice paths — financeIncomeAmount keeps zeros (phantom-if-|| = ${phantomIfOrUsed} not applied)`,
    )
  }
  else if (unsafeOrPaths.length > 0) {
    console.log(
      `WARN: ${unsafeOrPaths.length} live || listPrice path(s) remain (no paid-zero covered siblings in this DB — gate not tripped)`,
    )
  }
  else {
    console.log('OK: no paid-zero covered siblings and no live || listPrice paths')
  }

  section('10) Internal online conservation (Payment IPG/PAID vs settlement ledger)')
  // Platform identity check — not SEP merchant export. Gross PAID online should match
  // settlement gross (open + clawed) for the same payment ids; drift means missing settle/clawback.
  const onlinePaid = await prisma.$queryRaw`
    SELECT COALESCE(SUM(p.amount), 0)::int AS gross,
           COUNT(*)::int AS n
    FROM "Payment" p
    WHERE p.status IN ('PAID', 'REFUNDED')
      AND p.method IN ('IPG', 'PAID')
      AND COALESCE(p.purpose, '') <> 'topup'
  `
  const settled = await prisma.$queryRaw`
    SELECT COALESCE(SUM(s.gross), 0)::int AS gross,
           COALESCE(SUM(s."ownerNet"), 0)::int AS "ownerNet",
           COALESCE(SUM(s.commission), 0)::int AS commission,
           COUNT(*)::int AS n
    FROM "SettlementLedgerEntry" s
    JOIN "Payment" p ON p.id = s."paymentId"
    WHERE p.method IN ('IPG', 'PAID')
      AND COALESCE(p.purpose, '') <> 'topup'
  `
  const paidGross = Number(onlinePaid[0]?.gross ?? 0)
  const settledGross = Number(settled[0]?.gross ?? 0)
  const drift = paidGross - settledGross
  console.log(`Online PAID+REFUNDED payments (excl topup): n=${onlinePaid[0]?.n ?? 0} gross=${paidGross}`)
  console.log(`Settlement rows for those methods: n=${settled[0]?.n ?? 0} gross=${settledGross} ownerNet=${settled[0]?.ownerNet ?? 0} commission=${settled[0]?.commission ?? 0}`)
  console.log(`Gross drift (payments − settlements): ${drift}`)
  if (Math.abs(drift) > 0) {
    const missing = await prisma.$queryRaw`
      SELECT p.id, p.amount, p.status, p.method
      FROM "Payment" p
      WHERE p.status IN ('PAID', 'REFUNDED')
        AND p.method IN ('IPG', 'PAID')
        AND COALESCE(p.purpose, '') <> 'topup'
        AND NOT EXISTS (
          SELECT 1 FROM "SettlementLedgerEntry" s WHERE s."paymentId" = p.id
        )
      ORDER BY p."createdAt" DESC
      LIMIT 30
    `
    console.log(`Payments with no settlement row: ${missing.length} (sample up to 30)`)
    for (const row of missing) {
      console.log(`  payment=${row.id} amount=${row.amount} status=${row.status} method=${row.method}`)
    }
  }
  else {
    console.log('OK: online payment gross matches settlement gross')
  }

  section('Dump gate')
  console.log('Before APPLY=yes correction scripts or migrate deploy on shared/prod DB:')
  console.log('  - Keep a local dump under backups/ (gh workflow backup-db.yml or liara db backup download)')
  console.log('  - Re-run this audit after corrections to confirm counts drop to 0 / expected')
  console.log('\nAudit complete.')

  if (failOrListPrice) {
    process.exitCode = 1
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
