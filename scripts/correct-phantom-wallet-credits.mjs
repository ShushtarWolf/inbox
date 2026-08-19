#!/usr/bin/env node
/**
 * Zero out phantom wallet credits from cash/pay-at-club cancellation refunds.
 *
 * Before the fix, cancelling a CASH booking would credit the athlete wallet
 * even though the platform never received that money.
 *
 *   node scripts/correct-phantom-wallet-credits.mjs           # dry run
 *   APPLY=yes node scripts/correct-phantom-wallet-credits.mjs # write
 */
import { PrismaClient } from '@prisma/client'

const APPLY = process.env.APPLY === 'yes'
const prisma = new PrismaClient()

async function main() {
  // Phantom credits: REFUND_CREDIT where the payment was CASH/NOT_PAID (not real money),
  // OR REFUND_CREDIT with no linked payment at all (orphan credit).
  const phantomTx = await prisma.$queryRaw`
    SELECT wt.id, wt.amount, wt."walletId", wt."paymentId", wt."createdAt",
           p.method, p.provider, p.amount AS "paymentAmount",
           w."userId", u.name, u.phone
    FROM "WalletTransaction" wt
    JOIN "Wallet" w ON w.id = wt."walletId"
    LEFT JOIN "Payment" p ON p.id = wt."paymentId"
    LEFT JOIN "User" u ON u.id = w."userId"
    WHERE wt.type = 'REFUND_CREDIT'
      AND (p.method IN ('CASH', 'NOT_PAID') OR p.id IS NULL)
    ORDER BY wt."createdAt" ASC
  `

  if (!phantomTx.length) {
    console.log('No phantom wallet credits found. All balances are clean.')
    await prisma.$disconnect()
    return
  }

  console.log(`Found ${phantomTx.length} phantom REFUND_CREDIT transaction(s):\n`)

  let totalPhantom = 0
  const byWallet = new Map()

  for (const tx of phantomTx) {
    console.log(
      `  tx=${tx.id}  amount=${tx.amount}  method=${tx.method}  ` +
      `user=${tx.name || '?'} (${tx.phone || '?'})  date=${tx.createdAt.toISOString()}`
    )
    totalPhantom += tx.amount
    const prev = byWallet.get(tx.walletId) || { userId: tx.userId, name: tx.name, phone: tx.phone, total: 0, txIds: [] }
    prev.total += tx.amount
    prev.txIds.push(tx.id)
    byWallet.set(tx.walletId, prev)
  }

  console.log(`\nTotal phantom credits: ${totalPhantom} toman across ${byWallet.size} wallet(s)`)

  if (!APPLY) {
    console.log('\nDry run — no changes made. Run with APPLY=yes to correct.')
    await prisma.$disconnect()
    return
  }

  console.log('\nApplying corrections...\n')

  for (const [walletId, info] of byWallet) {
    await prisma.$transaction(async (tx) => {
      await tx.walletTransaction.create({
        data: {
          walletId,
          amount: -info.total,
          type: 'ADJUSTMENT',
          note: `Correction: removed ${info.total} toman phantom credit from ${info.txIds.length} cash-cancellation refund(s)`,
        },
      })
      await tx.wallet.update({
        where: { id: walletId },
        data: { balance: { decrement: info.total } },
      })
    })
    console.log(`  Corrected wallet ${walletId} (${info.name || '?'}, ${info.phone || '?'}): -${info.total} toman`)
  }

  console.log('\nDone. All phantom credits zeroed out.')
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
