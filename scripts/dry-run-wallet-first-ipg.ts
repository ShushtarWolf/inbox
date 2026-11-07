/**
 * Dry-run wallet-first IPG reconstruction.
 *
 *   node --import tsx scripts/dry-run-wallet-first-ipg.ts
 *
 * Default is read-only. Reconstruction rows are appended only when both
 * APPLY_RECONSTRUCTION=yes and APPROVE_WALLET_FIRST_RECON=yes are set.
 * That apply is net-zero (credit + matching debit) and is not for production
 * until a reviewed dry-run is approved. It never writes REFUND_CREDIT and
 * never deletes prior rows.
 *
 * Refund corrections are reported only. The existing
 * scripts/repair-historical-cancel-refunds.ts remains the refund-credit tool
 * and is not invoked here.
 *
 * Club-wallet sum versus stored balance is not an input. Do not repair that
 * drift from this report.
 */
import { PrismaClient } from '@prisma/client'
import { bookingTrackingCode } from '#shared/receiptToken.ts'
import { historicalRefundIdempotencyKey } from '#shared/historicalRefundRepair.ts'
import { planWalletFirstHistorical, type WalletTxSlice } from '#shared/walletFirstHistorical.ts'
import { applyHistoricalWalletFirstPair } from '../server/utils/walletFirstIpg.ts'

const APPLY = process.env.APPLY_RECONSTRUCTION === 'yes' && process.env.APPROVE_WALLET_FIRST_RECON === 'yes'
const TRACKING = (process.env.TRACKING || '').trim()
const prisma = new PrismaClient()

const CAVEAT = 'Club ledger sums are not used to propose refunds. A stored club balance that disagrees with its transaction sum (one observed case: 130 rows summing 15174500 toman against a stored 1979000) must be investigated separately and must not be auto-repaired or turned into athlete credits.'

function parseMeta(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function bump(map: Record<string, { count: number, toman: number }>, key: string, toman: number) {
  const row = map[key] || { count: 0, toman: 0 }
  row.count += 1
  row.toman += toman
  map[key] = row
}

async function main() {
  const payments = await prisma.payment.findMany({
    where: {
      OR: [
        { method: 'IPG' },
        { method: 'CASH' },
        { provider: 'sep' },
      ],
    },
    select: {
      id: true,
      amount: true,
      method: true,
      provider: true,
      purpose: true,
      status: true,
      userId: true,
      bookingId: true,
      metadataJson: true,
      createdAt: true,
      updatedAt: true,
      booking: { select: { status: true, userId: true, paymentMethod: true, cancelledAt: true } },
    },
  })
  const ids = payments.map((row) => row.id)
  const txs = ids.length
    ? await prisma.walletTransaction.findMany({
        where: { paymentId: { in: ids } },
        select: { paymentId: true, type: true, amount: true, note: true },
      })
    : []
  const byPayment = new Map<string, WalletTxSlice[]>()
  const refundSum = new Map<string, number>()
  const reconciled = new Set<string>()
  for (const tx of txs) {
    if (!tx.paymentId) continue
    const list = byPayment.get(tx.paymentId) || []
    list.push({ type: tx.type, amount: tx.amount })
    byPayment.set(tx.paymentId, list)
    if (tx.type === 'REFUND_CREDIT') refundSum.set(tx.paymentId, (refundSum.get(tx.paymentId) || 0) + tx.amount)
    if (tx.note === historicalRefundIdempotencyKey(tx.paymentId)) reconciled.add(tx.paymentId)
  }
  const ledgers = ids.length
    ? await prisma.settlementLedgerEntry.findMany({
        where: { paymentId: { in: ids } },
        select: { paymentId: true, ownerNet: true, clawedBackAt: true },
      })
    : []
  const unclawed = new Map(ledgers.filter((row) => !row.clawedBackAt).map((row) => [row.paymentId, row.ownerNet]))

  let trackingBookingId: string | null = null
  if (TRACKING) {
    const bookings = await prisma.booking.findMany({ select: { id: true } })
    trackingBookingId = bookings.find((row) => bookingTrackingCode(row.id) === TRACKING)?.id || null
  }

  const reconstructionBuckets: Record<string, { count: number, toman: number }> = {}
  const refundBuckets: Record<string, { count: number, toman: number }> = {}
  let pairCount = 0
  let pairGross = 0
  let cardCount = 0
  let cardGross = 0
  let refundCount = 0
  let refundToman = 0
  let refundClub = 0
  const samples: Record<string, string[]> = {}
  const toApply: Array<{
    paymentId: string
    bookingId: string | null
    userId: string
    amount: number
    debitType: 'IPG_BOOKING_DEBIT' | 'IPG_RETURNED_TO_CARD'
    inflowAt: Date
    outflowAt: Date | null
  }> = []

  for (const payment of payments) {
    if (TRACKING && payment.bookingId !== trackingBookingId) continue
    const plan = planWalletFirstHistorical({
      paymentId: payment.id,
      method: payment.method,
      provider: payment.provider,
      purpose: payment.purpose,
      paymentStatus: payment.status,
      bookingStatus: payment.booking?.status,
      bookingPaymentMethod: payment.booking?.paymentMethod,
      amount: payment.amount,
      paymentUserId: payment.userId,
      bookingUserId: payment.booking?.userId,
      metadata: parseMeta(payment.metadataJson),
      walletTxs: byPayment.get(payment.id) || [],
      refundCreditSum: refundSum.get(payment.id) || 0,
      alreadyRefundReconciled: reconciled.has(payment.id),
      unclawedOwnerNet: unclawed.get(payment.id) ?? 0,
    })
    if (plan.reconstruction.action === 'pair') {
      const gross = plan.reconstruction.amount
      bump(reconstructionBuckets, plan.reconstruction.kind, gross)
      if (plan.reconstruction.kind === 'card_returned') {
        cardCount += 1
        cardGross += gross
      } else {
        pairCount += 1
        pairGross += gross
      }
      const key = `reconstruction:${plan.reconstruction.kind}`
      samples[key] = [...(samples[key] || []), payment.id].slice(0, 20)
      toApply.push({
        paymentId: payment.id,
        bookingId: payment.bookingId,
        userId: plan.reconstruction.userId,
        amount: plan.reconstruction.amount,
        debitType: plan.reconstruction.debitType,
        inflowAt: payment.updatedAt || payment.createdAt,
        outflowAt: payment.booking?.cancelledAt || payment.updatedAt || null,
      })
    } else {
      bump(reconstructionBuckets, plan.reconstruction.reason, plan.capturedToman)
    }
    const refundKey = plan.refundCorrection.action === 'credit'
      ? `credit:${plan.refundCorrection.reason}`
      : `${plan.refundCorrection.action}:${plan.refundCorrection.reason}`
    const refundAmount = plan.refundCorrection.action === 'credit' ? plan.refundCorrection.amount : 0
    bump(refundBuckets, refundKey, refundAmount)
    if (plan.refundCorrection.action === 'credit') {
      refundCount += 1
      refundToman += plan.refundCorrection.amount
      refundClub += plan.refundClubImpactToman
    }
  }

  let applied = 0
  if (APPLY) {
    for (const row of toApply) {
      await prisma.$transaction(async (tx) => {
        const fresh = await tx.payment.findUnique({
          where: { id: row.paymentId },
          include: { booking: { select: { status: true, userId: true, paymentMethod: true, cancelledAt: true } } },
        })
        if (!fresh) return
        const freshTxs = await tx.walletTransaction.findMany({
          where: { paymentId: fresh.id },
          select: { type: true, amount: true, note: true },
        })
        const again = planWalletFirstHistorical({
          paymentId: fresh.id,
          method: fresh.method,
          provider: fresh.provider,
          purpose: fresh.purpose,
          paymentStatus: fresh.status,
          bookingStatus: fresh.booking?.status,
          bookingPaymentMethod: fresh.booking?.paymentMethod,
          amount: fresh.amount,
          paymentUserId: fresh.userId,
          bookingUserId: fresh.booking?.userId,
          metadata: parseMeta(fresh.metadataJson),
          walletTxs: freshTxs.map((tx) => ({ type: tx.type, amount: tx.amount })),
          refundCreditSum: freshTxs.filter((tx) => tx.type === 'REFUND_CREDIT').reduce((sum, tx) => sum + tx.amount, 0),
          alreadyRefundReconciled: freshTxs.some((tx) => tx.note === historicalRefundIdempotencyKey(fresh.id)),
          unclawedOwnerNet: 0,
        })
        if (again.reconstruction.action !== 'pair') return
        await applyHistoricalWalletFirstPair(tx, {
          userId: again.reconstruction.userId,
          paymentId: fresh.id,
          bookingId: fresh.bookingId,
          amount: again.reconstruction.amount,
          debitType: again.reconstruction.debitType,
          inflowAt: fresh.updatedAt || fresh.createdAt,
          outflowAt: fresh.booking?.cancelledAt || fresh.updatedAt || null,
        })
        applied += 1
      })
    }
  }

  const report = {
    mode: APPLY ? 'apply_reconstruction_only' : 'dry-run',
    unit: 'toman',
    refundCorrectionsApplied: false,
    bankCalled: false,
    withdrawalsCreated: false,
    recordsDeleted: false,
    reconstruction: {
      bookingLedgerCount: pairCount,
      bookingLedgerGrossToman: pairGross,
      cardReturnCount: cardCount,
      cardReturnGrossToman: cardGross,
      netWalletToman: 0,
      netClubToman: 0,
      buckets: reconstructionBuckets,
    },
    refundCorrection: {
      proposedCreditCount: refundCount,
      proposedCreditToman: refundToman,
      proposedNetWalletToman: refundToman,
      proposedNetClubToman: refundClub,
      buckets: refundBuckets,
      note: 'Reported only. This command does not write refund credits.',
    },
    samples,
    tracking: TRACKING
      ? { code: TRACKING, bookingId: trackingBookingId }
      : null,
    appliedReconstruction: applied,
    caveat: CAVEAT,
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message.split('\n')[0] : 'dry-run failed')
  await prisma.$disconnect()
  process.exit(1)
})
