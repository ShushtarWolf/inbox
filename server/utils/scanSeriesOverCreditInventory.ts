/**
 * Read-only inventory of series/pack payments where athlete REFUND_CREDIT exceeds
 * fair-share replay (computeSeriesCancelOverCredit).
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

export type SeriesOverCreditInventoryRow = {
  paymentId: string
  athleteUserId: string | null
  charged: number
  credited: number
  fairShare: number
  overCredit: number
  alreadyAdjusted: boolean
  cancelledCount: number
  totalSessions: number
  sessionCredits: number[]
  cancelledBookingIds: string[]
}

export type SeriesOverCreditInventoryResult = {
  scannedPrimaryPayments: number
  withCancels: number
  withOverCredit: number
  totalOverCreditToman: number
  rows: SeriesOverCreditInventoryRow[]
  truncated: boolean
}

const SERIES_META_MARKERS = [
  '"groupPrimaryBookingId"',
  '"seasonBookingId"',
  '"groupSiblingBookingIds"',
] as const

export async function scanSeriesOverCreditInventory(opts?: {
  limit?: number
  /** When set, only return rows with overCredit > 0. */
  onlyOver?: boolean
}): Promise<SeriesOverCreditInventoryResult> {
  const limit = Math.min(500, Math.max(1, Math.floor(Number(opts?.limit) || 200)))
  const onlyOver = opts?.onlyOver !== false

  const candidates = await prisma.payment.findMany({
    where: {
      amount: { gt: 0 },
      OR: SERIES_META_MARKERS.map((contains) => ({ metadataJson: { contains } })),
    },
    select: {
      id: true,
      amount: true,
      userId: true,
      bookingId: true,
      metadataJson: true,
      booking: { select: { userId: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 2000,
  })

  const rows: SeriesOverCreditInventoryRow[] = []
  let withCancels = 0
  let totalOver = 0
  let scanned = 0

  for (const payment of candidates) {
    const meta = parseSeriesPaymentMeta(payment.metadataJson)
    if (!isSeriesPaymentGroup(meta)) continue
    scanned += 1

    const primaryBookingId = meta.groupPrimaryBookingId || payment.bookingId
    const siblingIds = Array.isArray(meta.groupSiblingBookingIds) ? meta.groupSiblingBookingIds : []
    const groupIds = [...new Set([
      ...(primaryBookingId ? [primaryBookingId] : []),
      ...siblingIds.filter((id): id is string => typeof id === 'string' && id.length > 0),
    ])]
    if (groupIds.length < 2) continue

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
    if (cancelled.length === 0) continue
    withCancels += 1

    const creditAgg = await prisma.walletTransaction.aggregate({
      where: { paymentId: payment.id, type: 'REFUND_CREDIT' },
      _sum: { amount: true },
    })
    const credited = Math.max(0, creditAgg._sum.amount || 0)

    let rawMeta: Record<string, unknown> = {}
    try {
      rawMeta = payment.metadataJson
        ? JSON.parse(payment.metadataJson) as Record<string, unknown>
        : {}
    }
    catch {
      rawMeta = {}
    }

    const math = computeSeriesCancelOverCredit({
      primaryAmount: payment.amount,
      sessionPrice: meta.sessionPrice ?? null,
      totalSessions: groupIds.length,
      cancelledCount: cancelled.length,
      creditedTotal: credited,
      metadata: rawMeta,
    })

    const note = seriesOverCreditNote(payment.id)
    const existingAthlete = await prisma.walletTransaction.findFirst({
      where: {
        paymentId: payment.id,
        type: 'ADJUSTMENT',
        note,
        amount: { lt: 0 },
      },
      select: { id: true },
    })

    const overCredit = math.over
    if (onlyOver && overCredit <= 0) continue

    totalOver += overCredit
    rows.push({
      paymentId: payment.id,
      athleteUserId: payment.userId || payment.booking?.userId || cancelled[0]?.userId || null,
      charged: payment.amount,
      credited,
      fairShare: math.fairOwed,
      overCredit,
      alreadyAdjusted: Boolean(existingAthlete),
      cancelledCount: cancelled.length,
      totalSessions: groupIds.length,
      sessionCredits: math.sessionCredits,
      cancelledBookingIds: cancelled.map((b) => b.id),
    })

    if (rows.length >= limit) break
  }

  rows.sort((a, b) => b.overCredit - a.overCredit)

  return {
    scannedPrimaryPayments: scanned,
    withCancels,
    withOverCredit: rows.filter((r) => r.overCredit > 0).length,
    totalOverCreditToman: totalOver,
    rows,
    truncated: rows.length >= limit,
  }
}