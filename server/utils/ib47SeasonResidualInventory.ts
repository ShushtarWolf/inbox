import { isPaymentRefundable } from '#shared/bookingPayment.ts'
import { parseSeriesPaymentMeta } from '#shared/athleteSeason.ts'
import {
  isIb47ResidualCanonicalPrimary,
  proposedResidualOwed,
} from '#shared/moneyRepairGuards.ts'
import { prisma } from './prisma.ts'
import {
  countActiveSeasonSessions,
  sumRefundCreditForPayment,
} from './moneyRepairGuards.ts'
import { resolvePaymentClubId } from './staleBooking.ts'

export type Ib47ResidualRow = {
  paymentId: string
  seasonBookingId: string | null
  clubId: string | null
  primaryBookingId: string | null
  amount: number
  sessionRefundsTotal: number
  refundCreditSum: number
  residualOwed: number
  proposedWalletCredit: number
  activeSessions: number | null
  eligible: boolean
  ineligibleReason: string | null
  canonicalPath: 'ib47'
  repairNote: string | null
}

export async function inventoryIb47SeasonResidualShortfall(opts?: {
  paymentId?: string
}): Promise<{
  rows: Ib47ResidualRow[]
  candidateCount: number
  proposedWalletCreditToman: number
  anchor: Ib47ResidualRow | null
}> {
  const payments = await prisma.payment.findMany({
    where: {
      ...(opts?.paymentId ? { id: opts.paymentId } : {}),
      amount: { gt: 0 },
      method: 'IPG',
      status: 'PAID',
      NOT: { purpose: 'topup' },
      metadataJson: { contains: 'seasonBookingId' },
    },
    include: {
      booking: { select: { id: true, slot: { select: { court: { select: { clubId: true } } } } } },
    },
    orderBy: { amount: 'desc' },
    take: opts?.paymentId ? 1 : 200,
  })

  const rows: Ib47ResidualRow[] = []
  for (const payment of payments) {
    if (!isIb47ResidualCanonicalPrimary(payment) || !isPaymentRefundable(payment.status)) continue
    const meta = parseSeriesPaymentMeta(payment.metadataJson)
    const sessionRefunds = Math.max(0, Math.floor(Number(meta.sessionRefundsTotal) || 0))
    if (sessionRefunds <= 0 || sessionRefunds >= payment.amount) continue

    const clubId = resolvePaymentClubId(payment) || payment.booking?.slot?.court?.clubId || null
    const refundCreditSum = await sumRefundCreditForPayment(payment.id)
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
    const residualSettled = Boolean(
      meta.seriesResidualSettledAt
      || (typeof payment.metadataJson === 'string' && payment.metadataJson.includes('seriesResidualSettledAt')),
    )

    let activeSessions: number | null = null
    if (clubId && meta.seasonBookingId) {
      activeSessions = await countActiveSeasonSessions(clubId, meta.seasonBookingId)
    }

    let ineligibleReason: string | null = null
    if (activeSessions != null && activeSessions > 0) {
      ineligibleReason = 'season_has_active_sessions'
    }
    else if (residualOwed <= 0) {
      ineligibleReason = hasResidualNote || residualSettled ? 'already_settled' : 'no_gap'
    }
    else if (hasResidualNote || residualSettled) {
      ineligibleReason = 'already_settled'
    }

    const eligible = ineligibleReason == null && residualOwed > 0

    rows.push({
      paymentId: payment.id,
      seasonBookingId: meta.seasonBookingId ?? null,
      clubId,
      primaryBookingId: payment.bookingId,
      amount: payment.amount,
      sessionRefundsTotal: sessionRefunds,
      refundCreditSum,
      residualOwed,
      proposedWalletCredit: eligible ? residualOwed : 0,
      activeSessions,
      eligible,
      ineligibleReason,
      canonicalPath: 'ib47',
      repairNote: eligible ? `series-primary-residual:${payment.id}` : null,
    })
  }

  const anchorPaymentId = opts?.paymentId || 'cmwhw6oye00rsnr33m065fwhu'
  let anchor = rows.find((row) => row.paymentId === anchorPaymentId) || null
  if (!anchor) {
    const one = await inventoryIb47SeasonResidualShortfall({ paymentId: anchorPaymentId })
    anchor = one.rows[0] || null
    if (anchor && !rows.some((row) => row.paymentId === anchor!.paymentId)) {
      rows.unshift(anchor)
    }
  }

  const eligibleRows = rows.filter((row) => row.eligible)
  return {
    rows,
    candidateCount: eligibleRows.length,
    proposedWalletCreditToman: eligibleRows.reduce((sum, row) => sum + row.proposedWalletCredit, 0),
    anchor,
  }
}