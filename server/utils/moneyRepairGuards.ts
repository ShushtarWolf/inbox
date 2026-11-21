import {
  creditWouldBeSeriesResidual,
  isIb47ResidualCanonicalPrimary,
  proposedResidualOwed,
  seriesMetaResidual,
} from '#shared/moneyRepairGuards.ts'
import { parseSeriesPaymentMeta } from '#shared/athleteSeason.ts'
import { loadOwnerSeriesBookingsBySeasonId } from './ownerSeriesCancel.ts'
import { resolvePaymentClubId } from './staleBooking.ts'
import { prisma } from './prisma.ts'

export async function sumRefundCreditForPayment(paymentId: string): Promise<number> {
  const row = await prisma.walletTransaction.aggregate({
    where: { paymentId, type: 'REFUND_CREDIT' },
    _sum: { amount: true },
  })
  return Math.max(0, row._sum.amount || 0)
}

export async function refundHeadroomToman(paymentId: string, paymentAmount: number): Promise<number> {
  const credited = await sumRefundCreditForPayment(paymentId)
  return Math.max(0, Math.floor(paymentAmount) - credited)
}

export async function countActiveSeasonSessions(clubId: string, seasonBookingId: string): Promise<number> {
  const rows = await loadOwnerSeriesBookingsBySeasonId(clubId, seasonBookingId)
  return rows.length
}

export async function ib47ResidualDryRunRow(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      booking: { select: { id: true, slot: { select: { court: { select: { clubId: true } } } } } },
    },
  })
  if (!payment) return null
  const clubId = resolvePaymentClubId(payment) || payment.booking?.slot?.court?.clubId || null
  const meta = parseSeriesPaymentMeta(payment.metadataJson)
  const sessionRefunds = seriesMetaResidual(meta)
  const refundCreditSum = await sumRefundCreditForPayment(payment.id)
  const activeSessions = clubId && meta.seasonBookingId
    ? await countActiveSeasonSessions(clubId, meta.seasonBookingId)
    : null
  const residualOwed = proposedResidualOwed({
    amount: payment.amount,
    sessionRefundsTotal: sessionRefunds,
    refundCreditSum,
  })
  const hasResidualNote = await prisma.walletTransaction.findFirst({
    where: {
      paymentId: payment.id,
      type: 'REFUND_CREDIT',
      note: { contains: 'series-primary-residual' },
    },
    select: { id: true },
  })
  const eligible = Boolean(
    isIb47ResidualCanonicalPrimary(payment)
    && activeSessions === 0
    && residualOwed > 0
    && !hasResidualNote,
  )
  return {
    paymentId: payment.id,
    seasonBookingId: meta.seasonBookingId ?? null,
    clubId,
    amount: payment.amount,
    sessionRefundsTotal: sessionRefunds,
    refundCreditSum,
    residualOwed,
    proposedWalletCredit: eligible ? residualOwed : 0,
    activeSessions,
    eligible,
    canonicalPath: 'ib47' as const,
    repairNote: eligible ? `series-primary-residual:${payment.id}` : null,
  }
}

/** Block IB-13 credit when IB-47 owns the residual on this primary. */
export async function shouldBlockIb13ForIb47Primary(opts: {
  primaryPaymentId: string
  primaryAmount: number
  alreadyRefundedOnPrimary: number
  proposedCredit: number
  seasonBookingId?: string | null
  clubId?: string | null
}): Promise<{ block: boolean, reason?: string, activeSessions?: number }> {
  const payment = await prisma.payment.findUnique({
    where: { id: opts.primaryPaymentId },
    select: { method: true, status: true, amount: true, metadataJson: true },
  })
  if (!payment || !isIb47ResidualCanonicalPrimary(payment)) {
    return { block: false }
  }
  if (!creditWouldBeSeriesResidual({
    primaryAmount: opts.primaryAmount,
    alreadyRefundedOnPrimary: opts.alreadyRefundedOnPrimary,
    proposedCredit: opts.proposedCredit,
  })) {
    return { block: false }
  }
  const seasonId = opts.seasonBookingId
    || parseSeriesPaymentMeta(payment.metadataJson).seasonBookingId
  let activeSessions: number | undefined
  if (seasonId && opts.clubId) {
    activeSessions = await countActiveSeasonSessions(opts.clubId, seasonId)
    if (activeSessions > 0) {
      return { block: true, reason: 'season_has_active_sessions', activeSessions }
    }
  }
  return { block: true, reason: 'deferred_to_ib47_residual_sweep', activeSessions: activeSessions ?? 0 }
}

export async function capCreditToRefundHeadroom(paymentId: string, paymentAmount: number, amount: number): Promise<number> {
  const headroom = await refundHeadroomToman(paymentId, paymentAmount)
  return Math.max(0, Math.min(Math.floor(amount), headroom))
}