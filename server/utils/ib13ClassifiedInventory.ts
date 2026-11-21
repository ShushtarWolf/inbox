import { decideHistoricalCancelRefund } from '#shared/historicalRefundRepair.ts'
import {
  isIb47ResidualCanonicalPrimary,
  proposedResidualOwed,
} from '#shared/moneyRepairGuards.ts'
import { parseSeriesPaymentMeta } from '#shared/athleteSeason.ts'
import { prisma } from './prisma.ts'
import {
  countActiveSeasonSessions,
  shouldBlockIb13ForIb47Primary,
  sumRefundCreditForPayment,
} from './moneyRepairGuards.ts'
import { resolvePaymentClubId } from './staleBooking.ts'

export type Ib13Class =
  | 'refundable_now'
  | 'refundable_now_wallet_path'
  | 'already_refunded'
  | 'already_reconciled'
  | 'cash'
  | 'bank_outcome_unknown'
  | 'bank_outcome_pending'
  | 'no_verified_account'
  | 'deferred_to_ib47_residual'
  | 'season_has_active_sessions'
  | 'skip_no_gap'
  | 'not_cancelled'

export type Ib13ClassifiedRow = {
  ib13Class: Ib13Class
  paymentId: string
  bookingId: string | null
  method: string
  paymentStatus: string
  bookingStatus: string | null
  amount: number
  refundCreditSum: number
  walletDebitAbs: number
  proposedWalletCredit: number
  repairIdempotencyKey: string | null
  gatewayRefForBankCheck: string | null
  excludedByCanonicalPath: 'ib47' | null
  activeSeasonSessions: number | null
  applyEligible: boolean
}

function parseMeta(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  }
  catch {
    return {}
  }
}

export async function inventoryIb13Classified(opts?: { paymentId?: string }): Promise<{
  rows: Ib13ClassifiedRow[]
  summary: Record<string, { rowCount: number, totalGapToman: number }>
  applyEligibleCount: number
  applyEligibleToman: number
}> {
  const payments = await prisma.payment.findMany({
    where: {
      ...(opts?.paymentId ? { id: opts.paymentId } : {}),
      method: { in: ['IPG', 'PAID', 'CASH'] },
      NOT: { purpose: 'topup' },
      OR: [
        { booking: { status: 'CANCELLED' } },
        { status: { in: ['REFUNDED', 'FAILED', 'SUPERSEDED'] } },
      ],
    },
    include: {
      booking: { select: { status: true, userId: true, paymentMethod: true, slot: { select: { court: { select: { clubId: true } } } } } },
    },
    take: opts?.paymentId ? 50 : 5000,
  })

  const rows: Ib13ClassifiedRow[] = []
  for (const payment of payments) {
    const meta = parseMeta(payment.metadataJson)
    const debits = await prisma.walletTransaction.findMany({
      where: {
        paymentId: payment.id,
        type: { in: ['PAYMENT_DEBIT', 'IPG_BOOKING_DEBIT'] },
      },
      select: { amount: true, wallet: { select: { userId: true } } },
      orderBy: { createdAt: 'asc' },
    })
    const walletDebitAbs = debits.reduce((sum, row) => sum + Math.abs(row.amount || 0), 0)
    const debitedWalletUserId = debits[0]?.wallet?.userId || null
    const refundCreditSum = await sumRefundCreditForPayment(payment.id)

    const reconciled = await prisma.refundReconciliation.findFirst({
      where: {
        OR: [
          { idempotencyKey: `recon:historical-cancel:${payment.id}` },
          ...(payment.bookingId
            ? [{ idempotencyKey: `recon:historical-cancel:${payment.id}:${payment.bookingId}` }]
            : []),
        ],
      },
      select: { id: true },
    })

    const isCash = payment.method === 'CASH' || payment.booking?.paymentMethod === 'CASH'
    const isCancelled = payment.status === 'REFUNDED'
      || payment.status === 'FAILED'
      || payment.status === 'SUPERSEDED'
      || payment.booking?.status === 'CANCELLED'

    let ib13Class: Ib13Class = 'skip_no_gap'
    let proposed = 0
    let gatewayRef: string | null = null
    let excludedPath: 'ib47' | null = null
    let activeSeason: number | null = null

    if (reconciled) ib13Class = 'already_reconciled'
    else if (isCash) ib13Class = 'cash'
    else if (!isCancelled) ib13Class = 'not_cancelled'
    else {
      const decision = decideHistoricalCancelRefund({
        method: payment.method,
        bookingPaymentMethod: payment.booking?.paymentMethod,
        paymentStatus: payment.status,
        bookingStatus: payment.booking?.status,
        amount: payment.amount,
        userId: payment.userId || payment.booking?.userId,
        debitedWalletUserId,
        walletDebitAbs,
        metadata: meta,
        refundCreditSum,
      })

      if (decision.action === 'unresolved') {
        ib13Class = decision.reason === 'bank_outcome_pending'
          ? 'bank_outcome_pending'
          : decision.reason === 'no_verified_account'
            ? 'no_verified_account'
            : 'bank_outcome_unknown'
        if (ib13Class.startsWith('bank_outcome')) gatewayRef = payment.gatewayRef
      }
      else if (decision.action === 'skip') {
        if (decision.reason === 'already_credited') ib13Class = 'already_refunded'
        else if (decision.reason === 'deferred_ib47_residual') {
          ib13Class = 'deferred_to_ib47_residual'
          excludedPath = 'ib47'
        }
        else if (decision.reason === 'season_has_active_sessions') {
          ib13Class = 'season_has_active_sessions'
          excludedPath = 'ib47'
        }
        else ib13Class = 'skip_no_gap'
      }
      else if (decision.action === 'credit') {
        proposed = decision.amount
        ib13Class = payment.method === 'IPG'
          && payment.status === 'PAID'
          && payment.booking?.status === 'CANCELLED'
          && refundCreditSum === 0
          ? 'refundable_now'
          : 'refundable_now_wallet_path'

        // IB-47 mutual exclusion on series primary residual
        const seriesMeta = parseSeriesPaymentMeta(payment.metadataJson)
        const clubId = resolvePaymentClubId(payment) || payment.booking?.slot?.court?.clubId || null
        if (isIb47ResidualCanonicalPrimary(payment) && seriesMeta.seasonBookingId && clubId) {
          excludedPath = 'ib47'
          activeSeason = await countActiveSeasonSessions(clubId, seriesMeta.seasonBookingId)
          const sessionRefunds = Math.max(0, Math.floor(Number(seriesMeta.sessionRefundsTotal) || 0))
          if (activeSeason > 0) {
            ib13Class = 'season_has_active_sessions'
            proposed = 0
          }
          else {
            ib13Class = 'deferred_to_ib47_residual'
            proposed = 0
          }
          const residual = proposedResidualOwed({
            amount: payment.amount,
            sessionRefundsTotal: sessionRefunds,
            refundCreditSum,
          })
          if (residual > 0 && activeSeason === 0) {
            proposed = 0
          }
        }
        else if (seriesMeta.seasonBookingId && clubId) {
          const primaryId = payment.id
          const block = await shouldBlockIb13ForIb47Primary({
            primaryPaymentId: primaryId,
            primaryAmount: payment.amount,
            alreadyRefundedOnPrimary: sessionRefunds(seriesMeta),
            proposedCredit: proposed,
            seasonBookingId: seriesMeta.seasonBookingId,
            clubId,
          })
          if (block.block) {
            excludedPath = 'ib47'
            activeSeason = block.activeSessions ?? null
            ib13Class = block.reason === 'season_has_active_sessions'
              ? 'season_has_active_sessions'
              : 'deferred_to_ib47_residual'
            proposed = 0
          }
        }
      }
    }


    const applyEligible = (ib13Class === 'refundable_now' || ib13Class === 'refundable_now_wallet_path')
      && proposed > 0
      && !excludedPath

    rows.push({
      ib13Class,
      paymentId: payment.id,
      bookingId: payment.bookingId,
      method: payment.method,
      paymentStatus: payment.status,
      bookingStatus: payment.booking?.status ?? null,
      amount: payment.amount,
      refundCreditSum,
      walletDebitAbs,
      proposedWalletCredit: applyEligible ? proposed : 0,
      repairIdempotencyKey: applyEligible
        ? `recon:historical-cancel:${payment.id}${payment.bookingId ? `:${payment.bookingId}` : ''}`
        : null,
      gatewayRefForBankCheck: gatewayRef,
      excludedByCanonicalPath: excludedPath,
      activeSeasonSessions: activeSeason,
      applyEligible,
    })
  }

  const summary: Record<string, { rowCount: number, totalGapToman: number }> = {}
  for (const row of rows) {
    if (row.ib13Class === 'skip_no_gap' || row.ib13Class === 'not_cancelled') continue
    const bucket = summary[row.ib13Class] || { rowCount: 0, totalGapToman: 0 }
    bucket.rowCount += 1
    bucket.totalGapToman += row.proposedWalletCredit
    summary[row.ib13Class] = bucket
  }

  const applyRows = rows.filter((row) => row.applyEligible)
  return {
    rows,
    summary,
    applyEligibleCount: applyRows.length,
    applyEligibleToman: applyRows.reduce((sum, row) => sum + row.proposedWalletCredit, 0),
  }
}

function sessionRefunds(meta: ReturnType<typeof parseSeriesPaymentMeta>): number {
  return Math.max(0, Math.floor(Number(meta.sessionRefundsTotal) || 0))
}