#!/usr/bin/env node
/**
 * Idempotent: credit club wallets for historical competition PAID payments
 * that lack a SettlementLedgerEntry (pre competition→club settle).
 *
 * Only CONFIRMED entries with a linked PAID payment are considered.
 * Uses creditOwnerForPaidPayment only (unique paymentId ledger = safe re-run).
 *
 * Usage:
 *   npm run db:backfill-competition-settlements
 *   npm run db:backfill-competition-settlements -- --dry-run
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { creditOwnerForPaidPayment } from '../server/utils/settlement.ts'

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadEnvFile(resolve(process.cwd(), '.env'))

const prisma = new PrismaClient()
const dryRun = process.argv.includes('--dry-run')

async function main() {
  const entries = await prisma.competitionEntry.findMany({
    where: {
      status: 'CONFIRMED',
      paymentId: { not: null },
      payment: {
        status: 'PAID',
        purpose: 'competition',
      },
    },
    select: {
      id: true,
      paymentId: true,
      competition: { select: { clubId: true, title: true } },
    },
  })

  let credited = 0
  let skipped = 0
  let unresolved = 0

  for (const entry of entries) {
    const paymentId = entry.paymentId
    if (!paymentId) continue

    const existing = await prisma.settlementLedgerEntry.findUnique({
      where: { paymentId },
      select: { id: true },
    })
    if (existing) {
      skipped++
      continue
    }

    if (dryRun) {
      console.log(`[dry-run] would settle ${paymentId} (entry ${entry.id}, club ${entry.competition.clubId})`)
      credited++
      continue
    }

    const result = await creditOwnerForPaidPayment(paymentId)
    if (result.credited) {
      credited++
      console.log(`[backfill-competition-settlements] credited ${paymentId} → club ${entry.competition.clubId}`)
    } else if (result.reason === 'already_settled' || result.reason === 'already_paid') {
      skipped++
    } else {
      unresolved++
      console.warn(`[backfill-competition-settlements] skip ${paymentId}: ${result.reason}`)
    }
  }

  console.log(
    `[backfill-competition-settlements] done — credited=${credited} skipped=${skipped} unresolved=${unresolved} candidates=${entries.length}${dryRun ? ' (dry-run)' : ''}`,
  )
}

main()
  .catch((err) => {
    console.error('[backfill-competition-settlements] failed', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
