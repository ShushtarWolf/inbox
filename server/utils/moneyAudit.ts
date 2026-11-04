import { MANUAL_REFUND_MARKER } from '#shared/cancelRefund.ts'
import { prisma } from './prisma'
import { notifyAdminSms } from './adminNotify'

/** Owed guest/desk refunds older than this raise SLA alert (hours). */
export const OWED_REFUND_SLA_HOURS = 48

export type MoneyAuditSummary = {
  openCashSettlements: number
  refundedOpenSettlements: number
  manualBankRefundsOwed: number
  /** manualBankRefund owed older than OWED_REFUND_SLA_HOURS. */
  manualBankRefundsOwedAged: number
  deskCashReturnsOwed: number
  deskCashReturnsOwedAged: number
  userWalletsNegative: number
  clubWalletsNegative: number
  userBalanceDrift: number
  clubBalanceDrift: number
  /** PAID online booking payments with no SettlementLedgerEntry (needs money-jobs retry). */
  paidWithoutSettlement: number
  /** PAID top-ups with userId missing TOPUP_CREDIT (retryable). */
  paidTopUpWithoutCredit: number
  /** PAID top-ups with null userId and no credit (heal via maskedPan or dead-letter). */
  paidTopUpOrphanNoUser: number
  /** Sum of open ledger commission (platform float — gross − ownerNet, not clawed). */
  openPlatformCommissionToman: number
  pendingMoneyJobs: number
  failedMoneyJobs: number
  reversePendingPayments: number
  /** Card reversed at SEP but payment still PAID (cancel rolled back / resolve-reverse-pending) — re-run the cancel. */
  reversedStillPaid: number
  alert: boolean
}

/** Compact money audit for cron/admin — mirrors scripts/audit-money-bugs.mjs hot sections. */
export async function runMoneyAudit(): Promise<MoneyAuditSummary> {
  const owedCutoff = new Date(Date.now() - OWED_REFUND_SLA_HOURS * 60 * 60 * 1000)

  const [
    openCashSettlements,
    refundedOpenSettlements,
    manualBankRefundsOwed,
    manualBankRefundsOwedAged,
    deskCashReturnsOwed,
    deskCashReturnsOwedAged,
    userWalletsNegative,
    clubWalletsNegative,
    paidWithoutSettlement,
    paidTopUpWithoutCredit,
    paidTopUpOrphanNoUser,
    openPlatformCommission,
    pendingMoneyJobs,
    failedMoneyJobs,
    reversePendingPayments,
    reversedStillPaid,
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
    prisma.payment.count({
      where: {
        status: 'REFUNDED',
        updatedAt: { lt: owedCutoff },
        metadataJson: { contains: MANUAL_REFUND_MARKER },
        NOT: { metadataJson: { contains: '"manualBankRefund":"returned"' } },
      },
    }),
    prisma.payment.count({
      where: {
        status: 'REFUNDED',
        metadataJson: { contains: '"deskCashReturn":"owed"' },
      },
    }),
    prisma.payment.count({
      where: {
        status: 'REFUNDED',
        updatedAt: { lt: owedCutoff },
        metadataJson: { contains: '"deskCashReturn":"owed"' },
      },
    }),
    prisma.wallet.count({ where: { OR: [{ balance: { lt: 0 } }, { availableBalance: { lt: 0 } }] } }),
    prisma.clubWallet.count({ where: { OR: [{ balance: { lt: 0 } }, { availableBalance: { lt: 0 } }] } }),
    prisma.payment.count({
      where: {
        status: 'PAID',
        purpose: { not: 'topup' },
        method: { not: 'CASH' },
        settlementLedgerEntry: { is: null },
      },
    }),
    prisma.$queryRaw<Array<{ c: bigint }>>`
      SELECT COUNT(*)::bigint AS c FROM "Payment" p
      WHERE p.status = 'PAID' AND p.purpose = 'topup' AND p."userId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "WalletTransaction" t
          WHERE t."paymentId" = p.id AND t.type = 'TOPUP_CREDIT'
        )
    `.then((rows) => Number(rows[0]?.c || 0)),
    prisma.$queryRaw<Array<{ c: bigint }>>`
      SELECT COUNT(*)::bigint AS c FROM "Payment" p
      WHERE p.status = 'PAID' AND p.purpose = 'topup' AND p."userId" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "WalletTransaction" t
          WHERE t."paymentId" = p.id AND t.type = 'TOPUP_CREDIT'
        )
    `.then((rows) => Number(rows[0]?.c || 0)),
    prisma.$queryRaw<Array<{ s: bigint | null }>>`
      SELECT COALESCE(SUM(e.commission), 0)::bigint AS s
      FROM "SettlementLedgerEntry" e
      WHERE e."clawedBackAt" IS NULL AND e.commission > 0
    `.then((rows) => Number(rows[0]?.s || 0)),
    prisma.moneyJob.count({ where: { status: 'PENDING' } }).catch(() => 0),
    prisma.moneyJob.count({ where: { status: 'FAILED' } }).catch(() => 0),
    prisma.payment.count({
      where: {
        status: 'PAID',
        metadataJson: { contains: '"reversePending":true' },
      },
    }),
    prisma.payment.count({
      where: {
        status: 'PAID',
        metadataJson: { contains: '"gatewayReversed":true' },
      },
    }),
  ])

  // Drift: balance ≠ Σ signed txs − paid withdraws (WITHDRAW_PAID rows carry amount 0),
  // or balance ≠ available + locked. Same formula as walletBalanceDrift / audit-money-bugs.mjs.
  const userDrift = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*)::bigint AS c
    FROM "Wallet" w
    LEFT JOIN (
      SELECT "walletId", SUM(amount) AS s FROM "WalletTransaction"
      WHERE type NOT IN ('WITHDRAW_HOLD','WITHDRAW_RELEASE','LOCK','UNLOCK','WITHDRAW_PAID')
      GROUP BY "walletId"
    ) t ON t."walletId" = w.id
    LEFT JOIN (
      SELECT "userId", SUM(amount) AS s FROM "UserWithdrawRequest"
      WHERE status = 'PAID' GROUP BY "userId"
    ) p ON p."userId" = w."userId"
    WHERE w.balance <> COALESCE(t.s, 0) - COALESCE(p.s, 0)
       OR w.balance <> w."availableBalance" + w."lockedBalance"
  `
  const clubDrift = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*)::bigint AS c
    FROM "ClubWallet" w
    LEFT JOIN (
      SELECT "walletId", SUM(amount) AS s FROM "ClubWalletTransaction"
      WHERE type NOT IN ('WITHDRAW_HOLD','WITHDRAW_RELEASE','LOCK','UNLOCK','WITHDRAW_PAID')
      GROUP BY "walletId"
    ) t ON t."walletId" = w.id
    LEFT JOIN (
      SELECT "clubId", SUM(amount) AS s FROM "WithdrawRequest"
      WHERE status = 'PAID' GROUP BY "clubId"
    ) p ON p."clubId" = w."clubId"
    WHERE w.balance <> COALESCE(t.s, 0) - COALESCE(p.s, 0)
       OR w.balance <> w."availableBalance" + w."lockedBalance"
  `

  const summary: MoneyAuditSummary = {
    openCashSettlements,
    refundedOpenSettlements,
    manualBankRefundsOwed,
    manualBankRefundsOwedAged,
    deskCashReturnsOwed,
    deskCashReturnsOwedAged,
    userWalletsNegative,
    clubWalletsNegative,
    userBalanceDrift: Number(userDrift[0]?.c || 0),
    clubBalanceDrift: Number(clubDrift[0]?.c || 0),
    paidWithoutSettlement,
    paidTopUpWithoutCredit,
    paidTopUpOrphanNoUser,
    openPlatformCommissionToman: openPlatformCommission,
    pendingMoneyJobs,
    failedMoneyJobs,
    reversePendingPayments,
    reversedStillPaid,
    alert: false,
  }
  summary.alert = (
    summary.openCashSettlements
    + summary.refundedOpenSettlements
    + summary.manualBankRefundsOwed
    + summary.manualBankRefundsOwedAged
    + summary.deskCashReturnsOwedAged
    + summary.userWalletsNegative
    + summary.clubWalletsNegative
    + summary.userBalanceDrift
    + summary.clubBalanceDrift
    + summary.paidWithoutSettlement
    + summary.paidTopUpWithoutCredit
    + summary.paidTopUpOrphanNoUser
    + summary.failedMoneyJobs
    + summary.reversedStillPaid
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
