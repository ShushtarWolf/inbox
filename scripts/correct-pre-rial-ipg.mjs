#!/usr/bin/env node
/**
 * Rewrite paid SEP IPG rows from before toman×10 (bank rials ÷ 10 → toman).
 *
 *   node scripts/correct-pre-rial-ipg.mjs           # dry run
 *   APPLY=yes node scripts/correct-pre-rial-ipg.mjs # write
 */
import { PrismaClient } from '@prisma/client'

const APPLY = process.env.APPLY === 'yes'
const CUTOFF = new Date('2026-08-17T13:22:00.000Z')
const prisma = new PrismaClient()

function rialsToToman(rials) {
  return Math.max(1, Math.round(rials / 10))
}

function parseMeta(raw) {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function splitSettlement(gross, bps) {
  const safeGross = Number.isFinite(gross) && gross > 0 ? Math.floor(gross) : 0
  const commission = Math.floor((safeGross * bps) / 10_000)
  return { gross: safeGross, commissionBps: bps, commission, ownerNet: Math.max(0, safeGross - commission) }
}

function isCandidate(p) {
  if (p.status !== 'PAID' || p.method !== 'IPG' || p.provider !== 'sep') return false
  if (p.amount < 10 || !(p.createdAt < CUTOFF)) return false
  return parseMeta(p.metadataJson).preRialIpgCorrected !== true
}

async function main() {
  const rows = await prisma.payment.findMany({
    where: { status: 'PAID', method: 'IPG', provider: 'sep' },
    orderBy: { createdAt: 'asc' },
  })
  const candidates = rows.filter(isCandidate)
  const preview = candidates.map((p) => ({
    paymentId: p.id,
    purpose: p.purpose,
    previousAmount: p.amount,
    amountToman: rialsToToman(p.amount),
    sepAmountRials: p.amount,
    createdAt: p.createdAt,
  }))
  if (!APPLY) {
    console.log(JSON.stringify({ applied: false, count: preview.length, results: preview }, null, 2))
    return
  }

  const results = []
  for (const payment of candidates) {
    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.payment.findUnique({ where: { id: payment.id } })
      if (!row || !isCandidate(row)) return null
      const previousAmount = row.amount
      const amountToman = rialsToToman(previousAmount)
      const meta = parseMeta(row.metadataJson)
      let clubWalletDelta = 0
      let athleteWalletDelta = 0
      let settlementUpdated = false

      const ledger = await tx.settlementLedgerEntry.findUnique({ where: { paymentId: row.id } })
      if (ledger && !ledger.clawedBackAt) {
        const split = splitSettlement(amountToman, ledger.commissionBps)
        const delta = split.ownerNet - ledger.ownerNet
        if (delta !== 0 && ledger.clubId) {
          clubWalletDelta = delta
          const wallet = await tx.clubWallet.upsert({
            where: { clubId: ledger.clubId },
            update: {},
            create: { clubId: ledger.clubId },
          })
          await tx.clubWallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: clubWalletDelta } },
          })
          await tx.clubWalletTransaction.create({
            data: {
              walletId: wallet.id,
              amount: clubWalletDelta,
              type: 'ADJUSTMENT',
              paymentId: row.id,
              note: `Pre-rial IPG correction (bank ${previousAmount} rials → ${amountToman} toman)`,
            },
          })
        }
        else if (delta !== 0 && ledger.coachId) {
          const coach = await tx.coach.findUnique({
            where: { id: ledger.coachId },
            select: { userId: true },
          })
          if (coach?.userId) {
            athleteWalletDelta = delta
            const wallet = await tx.wallet.upsert({
              where: { userId: coach.userId },
              update: {},
              create: { userId: coach.userId },
            })
            await tx.wallet.update({
              where: { id: wallet.id },
              data: { balance: { increment: athleteWalletDelta } },
            })
            await tx.walletTransaction.create({
              data: {
                walletId: wallet.id,
                amount: athleteWalletDelta,
                type: 'ADJUSTMENT',
                paymentId: row.id,
                note: `Pre-rial IPG coach settlement correction (bank ${previousAmount} rials → ${amountToman} toman)`,
              },
            })
          }
        }
        await tx.settlementLedgerEntry.update({
          where: { id: ledger.id },
          data: { gross: split.gross, commission: split.commission, ownerNet: split.ownerNet },
        })
        settlementUpdated = true
      }

      if (row.purpose === 'topup' && row.userId) {
        const credited = await tx.walletTransaction.aggregate({
          where: { paymentId: row.id, type: 'TOPUP_CREDIT' },
          _sum: { amount: true },
        })
        athleteWalletDelta = amountToman - (credited._sum.amount || 0)
        if (athleteWalletDelta !== 0) {
          const wallet = await tx.wallet.upsert({
            where: { userId: row.userId },
            update: {},
            create: { userId: row.userId },
          })
          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: athleteWalletDelta } },
          })
          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              amount: athleteWalletDelta,
              type: 'ADJUSTMENT',
              paymentId: row.id,
              note: `Pre-rial IPG top-up correction (bank ${previousAmount} rials → ${amountToman} toman)`,
            },
          })
        }
      }

      await tx.payment.update({
        where: { id: row.id },
        data: {
          amount: amountToman,
          metadataJson: JSON.stringify({
            ...meta,
            preRialIpgCorrected: true,
            preRialIpgCorrectedAt: new Date().toISOString(),
            previousAmount,
            sepAmountRials: previousAmount,
            amountToman,
          }),
        },
      })

      return {
        paymentId: row.id,
        purpose: row.purpose,
        previousAmount,
        amountToman,
        sepAmountRials: previousAmount,
        clubWalletDelta,
        athleteWalletDelta,
        settlementUpdated,
      }
    })
    if (result) results.push(result)
  }

  console.log(JSON.stringify({ applied: true, count: results.length, results }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
