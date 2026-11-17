/**
 * Reviewed series over-credit correction (Phase F).
 * Dry-run by default. Apply appends athlete ADJUSTMENT debit + club ADJUSTMENT credit.
 * Never deletes REFUND_CREDIT / CLAWBACK rows.
 */
import {
  isSeriesPaymentGroup,
  parseSeriesPaymentMeta,
} from '../../shared/athleteSeason'
import {
  computeSeriesCancelOverCredit,
  seriesOverCreditNote,
} from '../../shared/seriesOverCredit'
import { prisma } from './prisma'
import { debitWallet } from './wallet'

export type SeriesOverCreditCorrection = {
  paymentId: string
  applied: boolean
  skipped: boolean
  reason?: string
  primaryAmount: number
  creditedTotal: number
  fairOwed: number
  over: number
  sessionCredits: number[]
  cancelledBookingIds: string[]
  athleteUserId: string | null
  clubId: string | null
  athleteBalance?: number
}

export async function correctSeriesOverCredit(opts: {
  paymentId: string
  apply?: boolean
}): Promise<SeriesOverCreditCorrection> {
  const paymentId = String(opts.paymentId || '').trim()
  const apply = opts.apply === true
  if (!paymentId) {
    return emptyResult('', 'missing_payment_id')
  }

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      amount: true,
      method: true,
      userId: true,
      bookingId: true,
      metadataJson: true,
      booking: { select: { userId: true } },
    },
  })
  if (!payment) return emptyResult(paymentId, 'payment_not_found')

  const meta = parseSeriesPaymentMeta(payment.metadataJson)
  if (!isSeriesPaymentGroup(meta)) {
    return emptyResult(paymentId, 'not_series_payment', { primaryAmount: payment.amount })
  }

  const primaryBookingId = meta.groupPrimaryBookingId || payment.bookingId
  const siblingIds = Array.isArray(meta.groupSiblingBookingIds) ? meta.groupSiblingBookingIds : []
  const groupIds = [...new Set([
    ...(primaryBookingId ? [primaryBookingId] : []),
    ...siblingIds.filter((id): id is string => typeof id === 'string' && id.length > 0),
  ])]
  if (groupIds.length < 2) {
    return emptyResult(paymentId, 'series_group_too_small', { primaryAmount: payment.amount })
  }

  const bookings = await prisma.booking.findMany({
    where: { id: { in: groupIds } },
    select: { id: true, status: true, cancelledAt: true, userId: true },
  })
  const cancelled = bookings
    .filter((b) => b.status === 'CANCELLED')
    .sort((a, b) => {
      const ta = a.cancelledAt?.getTime() ?? 0
      const tb = b.cancelledAt?.getTime() ?? 0
      return ta - tb
    })

  const creditAgg = await prisma.walletTransaction.aggregate({
    where: { paymentId, type: 'REFUND_CREDIT' },
    _sum: { amount: true },
  })
  const creditedTotal = Math.max(0, creditAgg._sum.amount || 0)

  const rawMeta = (() => {
    try {
      return payment.metadataJson ? JSON.parse(payment.metadataJson) as Record<string, unknown> : {}
    }
    catch {
      return {}
    }
  })()

  const math = computeSeriesCancelOverCredit({
    primaryAmount: payment.amount,
    sessionPrice: meta.sessionPrice ?? null,
    totalSessions: groupIds.length,
    cancelledCount: cancelled.length,
    creditedTotal,
    metadata: rawMeta,
  })

  const athleteUserId = payment.userId || payment.booking?.userId || cancelled[0]?.userId || null
  const settlement = await prisma.settlementLedgerEntry.findUnique({
    where: { paymentId },
    select: { clubId: true },
  })
  const clubId = settlement?.clubId || null
  const note = seriesOverCreditNote(paymentId)

  const base: SeriesOverCreditCorrection = {
    paymentId,
    applied: false,
    skipped: false,
    primaryAmount: payment.amount,
    creditedTotal,
    fairOwed: math.fairOwed,
    over: math.over,
    sessionCredits: math.sessionCredits,
    cancelledBookingIds: cancelled.map((b) => b.id),
    athleteUserId,
    clubId,
  }

  if (math.over <= 0) {
    return { ...base, skipped: true, reason: 'no_over_credit' }
  }
  if (!athleteUserId) {
    return { ...base, skipped: true, reason: 'no_athlete_user' }
  }

  const existingAthlete = await prisma.walletTransaction.findFirst({
    where: {
      paymentId,
      type: 'ADJUSTMENT',
      note,
      amount: { lt: 0 },
    },
    select: { id: true },
  })
  if (existingAthlete) {
    return { ...base, skipped: true, reason: 'already_adjusted' }
  }

  if (!apply) return base

  await prisma.$transaction(async (tx) => {
    await debitWallet(athleteUserId, math.over, {
      type: 'ADJUSTMENT',
      paymentId,
      note,
    }, tx)

    if (clubId) {
      const existingClub = await tx.clubWalletTransaction.findFirst({
        where: {
          paymentId,
          type: 'ADJUSTMENT',
          note,
          amount: { gt: 0 },
        },
        select: { id: true },
      })
      if (!existingClub) {
        const wallet = await tx.clubWallet.upsert({
          where: { clubId },
          update: {},
          create: { clubId },
        })
        await tx.clubWallet.update({
          where: { id: wallet.id },
          data: {
            balance: { increment: math.over },
            availableBalance: { increment: math.over },
          },
        })
        await tx.clubWalletTransaction.create({
          data: {
            walletId: wallet.id,
            amount: math.over,
            type: 'ADJUSTMENT',
            paymentId,
            note,
          },
        })
      }
    }
  })

  const wallet = await prisma.wallet.findUnique({
    where: { userId: athleteUserId },
    select: { availableBalance: true },
  })

  return {
    ...base,
    applied: true,
    athleteBalance: wallet?.availableBalance,
  }
}

function emptyResult(
  paymentId: string,
  reason: string,
  extra?: Partial<SeriesOverCreditCorrection>,
): SeriesOverCreditCorrection {
  return {
    paymentId,
    applied: false,
    skipped: true,
    reason,
    primaryAmount: 0,
    creditedTotal: 0,
    fairOwed: 0,
    over: 0,
    sessionCredits: [],
    cancelledBookingIds: [],
    athleteUserId: null,
    clubId: null,
    ...extra,
  }
}
