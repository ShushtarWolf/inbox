import { MANUAL_REFUND_MARKER } from '#shared/cancelRefund.ts'
import { prisma } from './prisma'
import { notifyAdminSms } from './adminNotify'

export type MoneyAuditSummary = {
  openCashSettlements: number
  refundedOpenSettlements: number
  manualBankRefundsOwed: number
  userWalletsNegative: number
  clubWalletsNegative: number
  userBalanceDrift: number
  clubBalanceDrift: number
  alert: boolean
}

/** Compact money audit for cron/admin — mirrors scripts/audit-money-bugs.mjs hot sections. */
export async function runMoneyAudit(): Promise<MoneyAuditSummary> {
  const [
    openCashSettlements,
    refundedOpenSettlements,
    manualBankRefundsOwed,
    userWalletsNegative,
    clubWalletsNegative,
  ] = await Promise.all([
    prisma.$queryRaw<Array<{ c: bigint }>>`
      SELECT COUNT(*)::bigint AS c
      FROM "SettlementLedgerEntry" e
      JOIN "Payment" p ON p.id = e."paymentId"
      WHERE e."clawedBackAt" IS NULL AND p.method = 'CASH'
    `.then((rows) => Number(rows[0]?.c || 0)),
    prisma.$queryRaw<Array<{ c: bigint }>>`
      SELECT COUNT(*)::bigint AS c
      FROM "SettlementLedgerEntry" e
      JOIN "Payment" p ON p.id = e."paymentId"
      WHERE e."clawedBackAt" IS NULL AND p.status = 'REFUNDED'
    `.then((rows) => Number(rows[0]?.c || 0)),
    prisma.payment.count({
      where: {
        status: 'REFUNDED',
        metadataJson: { contains: MANUAL_REFUND_MARKER },
        NOT: { metadataJson: { contains: '"manualBankRefund":"returned"' } },
      },
    }),
    prisma.wallet.count({ where: { OR: [{ balance: { lt: 0 } }, { availableBalance: { lt: 0 } }] } }),
    prisma.clubWallet.count({ where: { OR: [{ balance: { lt: 0 } }, { availableBalance: { lt: 0 } }] } }),
  ])

  // Drift: sample wallets where balance ≠ Σ signed (lightweight; full formula in audit script).
  const userDrift = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*)::bigint AS c FROM (
      SELECT w.id
      FROM "Wallet" w
      LEFT JOIN "WalletTransaction" t ON t."walletId" = w.id
      GROUP BY w.id, w.balance
      HAVING w.balance <> COALESCE(SUM(
        CASE
          WHEN t.type IN ('WITHDRAW_HOLD','WITHDRAW_RELEASE','LOCK','UNLOCK','WITHDRAW_PAID') THEN 0
          ELSE t.amount
        END
      ), 0)
    ) d
  `
  const clubDrift = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*)::bigint AS c FROM (
      SELECT w.id
      FROM "ClubWallet" w
      LEFT JOIN "ClubWalletTransaction" t ON t."walletId" = w.id
      GROUP BY w.id, w.balance
      HAVING w.balance <> COALESCE(SUM(
        CASE
          WHEN t.type IN ('WITHDRAW_HOLD','WITHDRAW_RELEASE','LOCK','UNLOCK','WITHDRAW_PAID') THEN 0
          ELSE t.amount
        END
      ), 0)
    ) d
  `

  const summary: MoneyAuditSummary = {
    openCashSettlements,
    refundedOpenSettlements,
    manualBankRefundsOwed,
    userWalletsNegative,
    clubWalletsNegative,
    userBalanceDrift: Number(userDrift[0]?.c || 0),
    clubBalanceDrift: Number(clubDrift[0]?.c || 0),
    alert: false,
  }
  summary.alert = (
    summary.openCashSettlements
    + summary.refundedOpenSettlements
    + summary.manualBankRefundsOwed
    + summary.userWalletsNegative
    + summary.clubWalletsNegative
    + summary.userBalanceDrift
    + summary.clubBalanceDrift
  ) > 0
  return summary
}

export async function runMoneyAuditAndAlert(opts?: { notify?: boolean }) {
  const summary = await runMoneyAudit()
  if (opts?.notify !== false && summary.alert) {
    await notifyAdminSms('ADMIN_WITHDRAW_REQUEST', {
      kind: 'money-audit',
      amount: summary.openCashSettlements + summary.clubWalletsNegative + summary.userBalanceDrift,
      sheba: `cash=${summary.openCashSettlements} negClub=${summary.clubWalletsNegative} driftU=${summary.userBalanceDrift}`,
      userName: 'money-audit',
      userPhone: '',
      requestId: `audit-${Date.now()}`,
    })
  }
  return summary
}
