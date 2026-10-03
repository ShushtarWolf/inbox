#!/usr/bin/env node
/**
 * Append-only correction: claw back SettlementLedgerEntry rows for CASH payments
 * that incorrectly credited club/coach withdrawable wallets.
 *
 * Never deletes or rewrites historical ledger/payment rows.
 *
 *   node scripts/correct-cash-settlements.mjs           # dry run
 *   APPLY=yes node scripts/correct-cash-settlements.mjs # write
 */
import { PrismaClient } from '@prisma/client'

const APPLY = process.env.APPLY === 'yes'
const prisma = new PrismaClient()

async function main() {
  const rows = await prisma.$queryRaw`
    SELECT s.id, s."paymentId", s."clubId", s."coachId", s."ownerNet", s."bookingId"
    FROM "SettlementLedgerEntry" s
    JOIN "Payment" p ON p.id = s."paymentId"
    WHERE p.method = 'CASH'
      AND s."clawedBackAt" IS NULL
    ORDER BY s."createdAt" ASC
  `

  console.log(`Open CASH settlements: ${rows.length}`)
  if (!rows.length) {
    await prisma.$disconnect()
    return
  }

  for (const row of rows) {
    console.log(
      `  entry=${row.id} payment=${row.paymentId} net=${row.ownerNet} club=${row.clubId || '-'} coach=${row.coachId || '-'}`,
    )
  }

  if (!APPLY) {
    console.log('\nDry run — no changes. Run with APPLY=yes after a local DB dump.')
    await prisma.$disconnect()
    return
  }

  // Inline append-only clawback (avoid Nuxt auto-import path from settlement.ts).
  let ok = 0
  let fail = 0
  for (const row of rows) {
    try {
      await prisma.$transaction(async (tx) => {
        const entry = await tx.settlementLedgerEntry.findUnique({ where: { paymentId: row.paymentId } })
        if (!entry || entry.clawedBackAt) return
        await tx.settlementLedgerEntry.update({
          where: { id: entry.id },
          data: { clawedBackAt: new Date() },
        })
        if (entry.ownerNet <= 0) return
        if (entry.coachId) {
          const coach = await tx.coach.findUnique({ where: { id: entry.coachId }, select: { userId: true } })
          if (!coach?.userId) return
          const wallet = await tx.wallet.upsert({
            where: { userId: coach.userId },
            update: {},
            create: { userId: coach.userId },
          })
          await tx.wallet.update({
            where: { id: wallet.id },
            data: {
              balance: { decrement: entry.ownerNet },
              availableBalance: { decrement: entry.ownerNet },
            },
          })
          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              amount: -entry.ownerNet,
              type: 'SETTLEMENT_CLAWBACK',
              paymentId: entry.paymentId,
              bookingId: entry.bookingId,
              note: 'Correction: clawback CASH desk settlement',
            },
          })
        }
        else if (entry.clubId) {
          const wallet = await tx.clubWallet.upsert({
            where: { clubId: entry.clubId },
            update: {},
            create: { clubId: entry.clubId },
          })
          await tx.clubWallet.update({
            where: { id: wallet.id },
            data: {
              balance: { decrement: entry.ownerNet },
              availableBalance: { decrement: entry.ownerNet },
            },
          })
          await tx.clubWalletTransaction.create({
            data: {
              walletId: wallet.id,
              amount: -entry.ownerNet,
              type: 'CLAWBACK',
              paymentId: entry.paymentId,
              bookingId: entry.bookingId,
              note: 'Correction: clawback CASH desk settlement',
            },
          })
        }
      })
      console.log(`  clawback ${row.paymentId}: ok`)
      ok += 1
    }
    catch (err) {
      console.error(`  FAIL ${row.paymentId}`, err)
      fail += 1
    }
  }
  console.log(`\nDone. ok=${ok} fail=${fail}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
