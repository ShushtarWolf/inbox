#!/usr/bin/env node
/**
 * Refund prior platform commission on open (non-clawed) club settlements.
 * Sets ledger commissionBps/commission → 0, ownerNet → gross, and credits
 * ClubWallet with an ADJUSTMENT for the refunded fee (available immediately).
 *
 *   node scripts/correct-zero-past-commission.mjs           # dry run
 *   APPLY=yes node scripts/correct-zero-past-commission.mjs # write
 *
 * Requires DATABASE_URL. Idempotent via note prefix + commission===0 skip.
 */
import { PrismaClient } from '@prisma/client'

const APPLY = process.env.APPLY === 'yes'
const NOTE_PREFIX = 'Zero-commission refund of prior platform fee'
const prisma = new PrismaClient()

async function alreadyRefunded(tx, paymentId) {
  const row = await tx.clubWalletTransaction.findFirst({
    where: {
      paymentId,
      type: 'ADJUSTMENT',
      note: { startsWith: NOTE_PREFIX },
    },
    select: { id: true },
  })
  return Boolean(row)
}

async function main() {
  const entries = await prisma.settlementLedgerEntry.findMany({
    where: {
      clubId: { not: null },
      clawedBackAt: null,
      commission: { gt: 0 },
    },
    orderBy: [{ clubId: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      paymentId: true,
      clubId: true,
      gross: true,
      commissionBps: true,
      commission: true,
      ownerNet: true,
      classDate: true,
      createdAt: true,
      club: { select: { nameFa: true } },
    },
  })

  const byClub = new Map()
  for (const row of entries) {
    const clubId = row.clubId
    if (!clubId) continue
    const bucket = byClub.get(clubId) || {
      clubId,
      clubName: row.club?.nameFa || clubId,
      entryCount: 0,
      refundToman: 0,
      entries: [],
    }
    bucket.entryCount += 1
    bucket.refundToman += row.commission
    bucket.entries.push({
      ledgerId: row.id,
      paymentId: row.paymentId,
      gross: row.gross,
      commissionBps: row.commissionBps,
      commission: row.commission,
      ownerNet: row.ownerNet,
      classDate: row.classDate,
    })
    byClub.set(clubId, bucket)
  }

  const clubs = [...byClub.values()]
  const totalRefund = clubs.reduce((sum, c) => sum + c.refundToman, 0)

  if (!APPLY) {
    console.log(JSON.stringify({
      applied: false,
      entryCount: entries.length,
      clubCount: clubs.length,
      totalRefundToman: totalRefund,
      clubs: clubs.map(({ clubId, clubName, entryCount, refundToman }) => ({
        clubId,
        clubName,
        entryCount,
        refundToman,
      })),
    }, null, 2))
    return
  }

  const results = []
  for (const row of entries) {
    const clubId = row.clubId
    if (!clubId || row.commission <= 0) continue

    const result = await prisma.$transaction(async (tx) => {
      const ledger = await tx.settlementLedgerEntry.findUnique({ where: { id: row.id } })
      if (!ledger || ledger.clawedBackAt || !ledger.clubId || ledger.commission <= 0) {
        return { skipped: true, reason: 'not_eligible' }
      }
      if (await alreadyRefunded(tx, ledger.paymentId)) {
        return { skipped: true, reason: 'already_refunded' }
      }

      const refund = ledger.commission
      await tx.settlementLedgerEntry.update({
        where: { id: ledger.id },
        data: {
          commissionBps: 0,
          commission: 0,
          ownerNet: ledger.gross,
        },
      })

      const wallet = await tx.clubWallet.upsert({
        where: { clubId: ledger.clubId },
        update: {},
        create: { clubId: ledger.clubId },
      })
      await tx.clubWallet.update({
        where: { id: wallet.id },
        data: {
          balance: { increment: refund },
          availableBalance: { increment: refund },
        },
      })
      await tx.clubWalletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: refund,
          type: 'ADJUSTMENT',
          paymentId: ledger.paymentId,
          note: `${NOTE_PREFIX} (${refund} toman @ ${ledger.commissionBps} bps)`,
        },
      })

      return {
        skipped: false,
        clubId: ledger.clubId,
        paymentId: ledger.paymentId,
        refund,
        newOwnerNet: ledger.gross,
      }
    })

    results.push(result)
  }

  const applied = results.filter((r) => !r.skipped)
  const skipped = results.filter((r) => r.skipped)
  const appliedByClub = new Map()
  for (const r of applied) {
    const prev = appliedByClub.get(r.clubId) || { clubId: r.clubId, refundToman: 0, count: 0 }
    prev.refundToman += r.refund
    prev.count += 1
    appliedByClub.set(r.clubId, prev)
  }

  console.log(JSON.stringify({
    applied: true,
    entryCount: applied.length,
    skippedCount: skipped.length,
    totalRefundToman: applied.reduce((s, r) => s + r.refund, 0),
    clubs: [...appliedByClub.values()],
    skipped,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
