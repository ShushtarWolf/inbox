/**
 * IB-47 — one-off + batch repair for fully-cancelled season primary IPG residual shortfall.
 * Reuses sweepSeasonPrimaryResidualIfFullyCancelled (PR #186) — REFUND_CREDIT + settlement clawback.
 *
 *   node --import tsx scripts/repair/ib47-season-residual-shortfall-apply.ts
 *   APPLY=yes node --import tsx scripts/repair/ib47-season-residual-shortfall-apply.ts
 *   APPLY=yes PAYMENT_ID=cmwhw6oye00rsnr33m065fwhu node --import tsx scripts/repair/ib47-season-residual-shortfall-apply.ts
 */
import { inventoryIb47SeasonResidualShortfall } from '../../server/utils/ib47SeasonResidualInventory.ts'
import { sweepSeasonPrimaryResidualIfFullyCancelled } from '../../server/utils/ownerSeriesCancel.ts'
import { prisma } from '../../server/utils/prisma.ts'

if (process.env.APPLY !== 'yes') {
  console.error('[ib47-apply] Dry-run only via scripts/repair/ib47-season-residual-dry-run.ts (APPLY blocked).')
  const report = await inventoryIb47SeasonResidualShortfall({
    paymentId: (process.env.PAYMENT_ID || '').trim() || undefined,
  })
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

const APPLY = true
const PAYMENT_ID = (process.env.PAYMENT_ID || '').trim()

type Candidate = {
  paymentId: string
  seasonBookingId: string
  clubId: string
  residualOwed: number
  primaryBookingId: string | null
}

async function listCandidates(): Promise<Candidate[]> {
  const { rows } = await inventoryIb47SeasonResidualShortfall(
    PAYMENT_ID ? { paymentId: PAYMENT_ID } : undefined,
  )
  return rows
    .filter((row) => row.eligible && row.clubId && row.seasonBookingId)
    .map((row) => ({
      paymentId: row.paymentId,
      seasonBookingId: row.seasonBookingId!,
      clubId: row.clubId!,
      primaryBookingId: row.primaryBookingId,
      residualOwed: row.residualOwed,
    }))
}

const candidates = await listCandidates()
const dryRunLines = candidates.map((row) => ({
  paymentId: row.paymentId,
  seasonBookingId: row.seasonBookingId,
  clubId: row.clubId,
  proposedWalletCredit: row.residualOwed,
  repairNote: `series-primary-residual:${row.paymentId}`,
  action: APPLY ? 'apply' : 'dry-run',
}))

const applied: Array<{ paymentId: string, seasonBookingId: string, amount: number, ok: boolean, error?: string }> = []

if (APPLY) {
  for (const row of candidates) {
    try {
      const fresh = await listCandidates()
      const still = fresh.find((c) => c.paymentId === row.paymentId && c.seasonBookingId === row.seasonBookingId)
      if (!still || still.residualOwed !== row.residualOwed) {
        applied.push({
          paymentId: row.paymentId,
          seasonBookingId: row.seasonBookingId,
          amount: 0,
          ok: false,
          error: 'dry_run_conditions_changed',
        })
        continue
      }
      const result = await sweepSeasonPrimaryResidualIfFullyCancelled({
        clubId: row.clubId,
        seasonBookingId: row.seasonBookingId,
        reason: 'ib47-historical-season-residual-repair',
      })
      const amount = result?.amount ?? 0
      applied.push({
        paymentId: row.paymentId,
        seasonBookingId: row.seasonBookingId,
        amount,
        ok: amount > 0,
        skipped: result === null && amount === 0,
      })
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      applied.push({
        paymentId: row.paymentId,
        seasonBookingId: row.seasonBookingId,
        amount: 0,
        ok: false,
        error: message.slice(0, 500),
      })
    }
  }
}

console.log(JSON.stringify({
  mode: APPLY ? 'apply' : 'dry-run',
  candidateCount: candidates.length,
  proposedWalletCreditToman: candidates.reduce((sum, row) => sum + row.residualOwed, 0),
  dryRunLines,
  applied,
}, null, 2))

await prisma.$disconnect()