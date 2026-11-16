import { bookingTrackingCode } from '#shared/receiptToken.ts'
import {
  decideHistoricalCancelRefund,
  historicalRefundIdempotencyKey,
  type HistoricalRefundDecision,
} from '#shared/historicalRefundRepair.ts'
import { prisma } from './prisma'

type Candidate = {
  id: string
  amount: number
  method: string
  status: string
  userId: string | null
  bookingId: string | null
  metadataJson: string | null
  booking: { status: string, userId: string | null, paymentMethod: string | null } | null
}

export type HistoricalCancelRefundLine = {
  paymentId: string
  bookingId: string | null
  decision: HistoricalRefundDecision
}

export type HistoricalCancelRefundReport = {
  applied: boolean
  creditCount: number
  creditToman: number
  appliedCount: number
  counts: Record<string, number>
  credits: Array<{ paymentId: string, bookingId: string | null, amount: number, reason: string }>
  trackingMatch: HistoricalCancelRefundLine | null
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

async function loadCandidates(): Promise<Candidate[]> {
  return prisma.payment.findMany({
    where: {
      OR: [
        { status: 'REFUNDED' },
        { booking: { status: 'CANCELLED' } },
      ],
      method: { in: ['IPG', 'PAID', 'CASH'] },
    },
    select: {
      id: true,
      amount: true,
      method: true,
      status: true,
      userId: true,
      bookingId: true,
      metadataJson: true,
      booking: { select: { status: true, userId: true, paymentMethod: true } },
    },
  })
}

async function creditSums(paymentIds: string[]) {
  if (!paymentIds.length) return new Map<string, number>()
  const rows = await prisma.walletTransaction.groupBy({
    by: ['paymentId'],
    where: { paymentId: { in: paymentIds }, type: 'REFUND_CREDIT' },
    _sum: { amount: true },
  })
  return new Map(rows.map((row) => [row.paymentId || '', row._sum.amount || 0]))
}

async function reconKeys(paymentIds: string[]) {
  if (!paymentIds.length) return new Set<string>()
  const keys = paymentIds.map(historicalRefundIdempotencyKey)
  const rows = await prisma.refundReconciliation.findMany({
    where: { idempotencyKey: { in: keys } },
    select: { idempotencyKey: true },
  })
  return new Set(rows.map((row) => row.idempotencyKey))
}

export async function inventoryHistoricalCancelRefunds(tracking?: string): Promise<{
  lines: HistoricalCancelRefundLine[]
  counts: Record<string, number>
  creditCount: number
  creditToman: number
  trackingMatch: HistoricalCancelRefundLine | null
}> {
  const candidates = await loadCandidates()
  const ids = candidates.map((row) => row.id)
  const [sums, keys] = await Promise.all([creditSums(ids), reconKeys(ids)])
  let trackingBookingId: string | null = null
  if (tracking) {
    const bookings = await prisma.booking.findMany({ select: { id: true } })
    trackingBookingId = bookings.find((row) => bookingTrackingCode(row.id) === tracking)?.id || null
  }

  const lines: HistoricalCancelRefundLine[] = []
  const counts: Record<string, number> = {}
  let creditCount = 0
  let creditToman = 0
  let trackingMatch: HistoricalCancelRefundLine | null = null

  for (const row of candidates) {
    const decision = decideHistoricalCancelRefund({
      method: row.method,
      bookingPaymentMethod: row.booking?.paymentMethod,
      paymentStatus: row.status,
      bookingStatus: row.booking?.status,
      amount: row.amount,
      userId: row.userId || row.booking?.userId || null,
      metadata: parseMeta(row.metadataJson),
      refundCreditSum: sums.get(row.id) || 0,
      alreadyReconciled: keys.has(historicalRefundIdempotencyKey(row.id)),
    })
    const line = { paymentId: row.id, bookingId: row.bookingId, decision }
    lines.push(line)
    const bucket = `${decision.action}:${decision.reason}`
    counts[bucket] = (counts[bucket] || 0) + 1
    if (decision.action === 'credit') {
      creditCount += 1
      creditToman += decision.amount
    }
    if (trackingBookingId && row.bookingId === trackingBookingId) trackingMatch = line
  }

  return { lines, counts, creditCount, creditToman, trackingMatch: tracking ? trackingMatch : null }
}

async function applyCredit(line: HistoricalCancelRefundLine): Promise<boolean> {
  if (line.decision.action !== 'credit') return false
  const key = historicalRefundIdempotencyKey(line.paymentId)
  let wrote = false
  await prisma.$transaction(async (tx) => {
    const existing = await tx.refundReconciliation.findUnique({ where: { idempotencyKey: key } })
    if (existing) return
    const payment = await tx.payment.findUnique({
      where: { id: line.paymentId },
      include: { booking: { select: { userId: true, paymentMethod: true, status: true } } },
    })
    if (!payment) return
    const credited = await tx.walletTransaction.aggregate({
      where: { paymentId: payment.id, type: 'REFUND_CREDIT' },
      _sum: { amount: true },
    })
    const userId = payment.userId || payment.booking?.userId || null
    const again = decideHistoricalCancelRefund({
      method: payment.method,
      bookingPaymentMethod: payment.booking?.paymentMethod,
      paymentStatus: payment.status,
      bookingStatus: payment.booking?.status,
      amount: payment.amount,
      userId,
      metadata: parseMeta(payment.metadataJson),
      refundCreditSum: credited._sum.amount || 0,
      alreadyReconciled: false,
    })
    if (again.action !== 'credit' || !userId) return

    const wallet = await tx.wallet.upsert({
      where: { userId },
      update: {},
      create: { userId },
    })
    const claimed = await tx.wallet.updateMany({
      where: { id: wallet.id },
      data: {
        balance: { increment: again.amount },
        availableBalance: { increment: again.amount },
      },
    })
    if (claimed.count !== 1) return
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        amount: again.amount,
        type: 'REFUND_CREDIT',
        paymentId: payment.id,
        bookingId: key,
        note: key,
      },
    })

    let clubClawback = 0
    let commissionRecorded = 0
    const ledger = await tx.settlementLedgerEntry.findUnique({ where: { paymentId: payment.id } })
    if (ledger && ledger.gross > 0 && !ledger.clawedBackAt) {
      const prior = ledger.clubId
        ? await tx.clubWalletTransaction.aggregate({
            where: { paymentId: payment.id, type: 'CLAWBACK' },
            _sum: { amount: true },
          })
        : await tx.walletTransaction.aggregate({
            where: { paymentId: payment.id, type: 'SETTLEMENT_CLAWBACK' },
            _sum: { amount: true },
          })
      const alreadyClawed = Math.abs(prior._sum.amount || 0)
      const remaining = Math.max(0, ledger.ownerNet - alreadyClawed)
      const proportional = Math.floor((ledger.ownerNet * again.amount) / ledger.gross)
      clubClawback = Math.min(remaining, Math.max(0, proportional))
      commissionRecorded = Math.max(0, again.amount - clubClawback)
      if (clubClawback > 0 && ledger.clubId) {
        const clubWallet = await tx.clubWallet.findUnique({ where: { clubId: ledger.clubId } })
        if (clubWallet) {
          const fromLocked = Math.min(clubWallet.lockedBalance, clubClawback)
          const fromAvailable = clubClawback - fromLocked
          await tx.clubWallet.update({
            where: { id: clubWallet.id },
            data: {
              balance: { decrement: clubClawback },
              lockedBalance: { decrement: fromLocked },
              availableBalance: { decrement: fromAvailable },
            },
          })
          await tx.clubWalletTransaction.create({
            data: {
              walletId: clubWallet.id,
              amount: -clubClawback,
              type: 'CLAWBACK',
              paymentId: payment.id,
              bookingId: key,
              note: key,
            },
          })
        }
      }
      const fully = alreadyClawed + clubClawback >= ledger.ownerNet
      await tx.settlementLedgerEntry.update({
        where: { id: ledger.id },
        data: fully
          ? { clawedBackAt: new Date(), commissionReversed: ledger.commission }
          : { commissionReversed: { increment: commissionRecorded } },
      })
    }

    await tx.refundReconciliation.create({
      data: {
        idempotencyKey: key,
        paymentId: payment.id,
        userId,
        amount: again.amount,
        clubClawback,
        commissionRecorded,
        reason: again.reason,
        evidenceJson: JSON.stringify({
          paymentStatus: payment.status,
          bookingStatus: payment.booking?.status || null,
          method: payment.method,
          priorRefundCredit: credited._sum.amount || 0,
          metadata: parseMeta(payment.metadataJson),
        }),
      },
    })
    wrote = true
  })
  return wrote
}

/** Dry-run by default. `apply: true` appends wallet credits + recon rows (never deletes). */
export async function runHistoricalCancelRefundRepair(opts?: {
  apply?: boolean
  tracking?: string
}): Promise<HistoricalCancelRefundReport> {
  const apply = opts?.apply === true
  const report = await inventoryHistoricalCancelRefunds(opts?.tracking)
  const credits = report.lines
    .filter((line) => line.decision.action === 'credit')
    .map((line) => ({
      paymentId: line.paymentId,
      bookingId: line.bookingId,
      amount: line.decision.action === 'credit' ? line.decision.amount : 0,
      reason: line.decision.reason,
    }))

  let appliedCount = 0
  if (apply) {
    for (const line of report.lines) {
      if (line.decision.action !== 'credit') continue
      if (await applyCredit(line)) appliedCount += 1
    }
  }

  return {
    applied: apply,
    creditCount: report.creditCount,
    creditToman: report.creditToman,
    appliedCount,
    counts: report.counts,
    credits: credits.slice(0, 50),
    trackingMatch: report.trackingMatch,
  }
}
