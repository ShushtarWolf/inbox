import { inventoryIb13Classified } from './ib13ClassifiedInventory.ts'
import { inventoryIb47SeasonResidualShortfall } from './ib47SeasonResidualInventory.ts'
import { runHistoricalOrphanPaymentRepair } from './historicalOrphanPayments.ts'
import { IB47_ANCHOR_PAYMENT_ID } from '#shared/moneyRepairGuards.ts'

export type MoneyRepairDryRunReport = {
  mode: 'dry-run'
  applied: false
  ib47: Awaited<ReturnType<typeof inventoryIb47SeasonResidualShortfall>>
  ib13: Awaited<ReturnType<typeof inventoryIb13Classified>>
  ib14: {
    rows: Awaited<ReturnType<typeof runHistoricalOrphanPaymentRepair>>['rows']
    creditCount: number
    creditToman: number
  }
  mutualExclusions: Array<{
    paymentId: string
    canonicalPath: 'ib47'
    excludedFrom: 'ib13'
    reason: string
    activeSeasonSessions: number | null
    residualOwed: number
  }>
  anchorPaymentId: string
}

export async function runMoneyRepairDryRun(opts?: {
  paymentId?: string
}): Promise<MoneyRepairDryRunReport> {
  const anchor = opts?.paymentId || IB47_ANCHOR_PAYMENT_ID
  const [ib47, ib13, ib14Report] = await Promise.all([
    inventoryIb47SeasonResidualShortfall({ paymentId: opts?.paymentId }),
    inventoryIb13Classified({ paymentId: opts?.paymentId }),
    runHistoricalOrphanPaymentRepair({ apply: false }),
  ])

  const exclusions = ib13.rows
    .filter((row) => row.excludedByCanonicalPath === 'ib47')
    .map((row) => {
      const anchorRow = ib47.anchor
      return {
        paymentId: row.paymentId,
        canonicalPath: 'ib47' as const,
        excludedFrom: 'ib13' as const,
        reason: row.ib13Class,
        activeSeasonSessions: row.activeSeasonSessions,
        residualOwed: anchorRow?.paymentId === row.paymentId ? anchorRow.residualOwed : 0,
      }
    })

  return {
    mode: 'dry-run',
    applied: false,
    ib47,
    ib13,
    ib14: {
      rows: ib14Report.rows,
      creditCount: ib14Report.creditCount,
      creditToman: ib14Report.creditToman,
    },
    mutualExclusions: exclusions,
    anchorPaymentId: anchor,
  }
}