import { bookingTrackingCode } from '#shared/receiptToken.ts'
import {
  isSeriesPaymentGroup,
  parseSeriesPaymentMeta,
} from '#shared/athleteSeason.ts'
import {
  decideHistoricalCancelRefund,
  historicalRefundIdempotencyKey,
  type HistoricalRefundDecision,
} from '#shared/historicalRefundRepair.ts'
import {
  classifyHistoricalRefundBucket,
  isSeriesSiblingCancelRow,
  type HistoricalRefundBucket,
} from '#shared/historicalRefundInventory.ts'
import { cancelWalletCreditAmount } from '#shared/owedCancelRefund.ts'
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
  bucket: HistoricalRefundBucket
  owedAmount?: number
  creditedAmount?: number
  primaryPaymentId?: string | null
}

export type HistoricalCancelRefundReport = {
  applied: boolean
  creditCount: number
  creditToman: number
  appliedCount: number
  counts: Record<string, number>
  credits: Array<{ paymentId: string, bookingId: string | null, amount: number, reason: string }>
  trackingMatch: HistoricalCancelRefundLine | null
  /** Ledger shortfalls (wallet debit without matching refund), independent of cancel metadata. */
  ledgerShortfalls: Array<{
    paymentId: string
    bookingId: string | null
    method: string
    paymentStatus: string
    amount: number
    debited: number
    refunded: number
    net: number
    payerUserId: string | null
  }>
  /** Samples for ops review when creditCount is 0 but skips look suspicious. */
  samples: {
    cardAlreadyReversed: Array<{ paymentId: string, bookingId: string | null, method: string, amount: number, userId: string | null, metaKeys: string[] }>
    noVerifiedAccount: Array<{ paymentId: string, bookingId: string | null, method: string, amount: number, metaKeys: string[] }>
  }
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
  // Include FAILED/SUPERSEDED so detached (re-booked) wallet-paid cancels still repair.
  return prisma.payment.findMany({
    where: {
      OR: [
        { status: { in: ['REFUNDED', 'FAILED', 'SUPERSEDED'] } },
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

/** Absolute toman debited from athlete wallets + first payer userId per payment. */
async function walletDebitInfo(paymentIds: string[]) {
  const abs = new Map<string, number>()
  const payer = new Map<string, string>()
  if (!paymentIds.length) return { abs, payer }
  const rows = await prisma.walletTransaction.findMany({
    where: {
      paymentId: { in: paymentIds },
      type: { in: ['PAYMENT_DEBIT', 'IPG_BOOKING_DEBIT'] },
    },
    select: {
      paymentId: true,
      amount: true,
      createdAt: true,
      wallet: { select: { userId: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  for (const row of rows) {
    if (!row.paymentId) continue
    abs.set(row.paymentId, (abs.get(row.paymentId) || 0) + Math.abs(row.amount || 0))
    if (!payer.has(row.paymentId) && row.wallet?.userId) payer.set(row.paymentId, row.wallet.userId)
  }
  return { abs, payer }
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

type PrimaryPaymentRow = {
  id: string
  bookingId: string | null
  amount: number
  status: string
  metadataJson: string | null
}

async function loadPrimaryPaymentsByBookingId(candidates: Candidate[]) {
  const bookingIds = new Set<string>()
  for (const row of candidates) {
    const seriesMeta = parseSeriesPaymentMeta(row.metadataJson)
    if (!isSeriesPaymentGroup(seriesMeta)) continue
    const primaryBookingId = seriesMeta.coveredByBookingId
      || seriesMeta.groupPrimaryBookingId
      || (Math.floor(row.amount) === 0 ? null : row.bookingId)
    if (primaryBookingId) bookingIds.add(primaryBookingId)
  }
  if (!bookingIds.size) return new Map<string, PrimaryPaymentRow>()
  const rows = await prisma.payment.findMany({
    where: { bookingId: { in: [...bookingIds] } },
    select: {
      id: true,
      bookingId: true,
      amount: true,
      status: true,
      metadataJson: true,
    },
  })
  return new Map(
    rows
      .filter((row) => row.bookingId)
      .map((row) => [row.bookingId as string, row]),
  )
}

function seriesInventoryFields(
  row: Candidate,
  primaryByBooking: Map<string, PrimaryPaymentRow>,
  creditSums: Map<string, number>,
) {
  const meta = parseMeta(row.metadataJson)
  const seriesMeta = parseSeriesPaymentMeta(row.metadataJson)
  if (!isSeriesPaymentGroup(seriesMeta)) {
    return {
      treatAsSeries: false as const,
      primaryAmount: null as number | null,
      sessionPrice: null as number | null,
      alreadyRefundedOnPrimary: null as number | null,
      creditTargetPaymentId: row.id,
      primaryPaymentStatus: null as string | null,
      isSeriesSibling: false,
    }
  }
  const primaryBookingId = seriesMeta.coveredByBookingId
    || seriesMeta.groupPrimaryBookingId
    || (Math.floor(row.amount) === 0 ? null : row.bookingId)
  const primary = primaryBookingId ? primaryByBooking.get(primaryBookingId) : null
  const primaryMeta = primary ? parseMeta(primary.metadataJson) : {}
  const sessionPrice = seriesMeta.sessionPrice ?? (typeof primaryMeta.sessionPrice === 'number' ? primaryMeta.sessionPrice : null)
  const alreadyMeta = Math.max(0, Math.floor(Number(primaryMeta.sessionRefundsTotal) || 0))
  const creditedOnPrimary = primary ? (creditSums.get(primary.id) || 0) : 0
  const alreadyRefundedOnPrimary = Math.max(alreadyMeta, creditedOnPrimary)
  const creditTargetPaymentId = primary?.id || row.id
  const isSeriesSibling = isSeriesSiblingCancelRow({
    paymentAmount: row.amount,
    bookingStatus: row.booking?.status,
    metadata: meta,
  })
  return {
    treatAsSeries: true as const,
    primaryAmount: primary?.amount ?? (Math.floor(row.amount) > 0 ? row.amount : null),
    sessionPrice,
    alreadyRefundedOnPrimary,
    creditTargetPaymentId,
    primaryPaymentStatus: primary?.status ?? null,
    isSeriesSibling,
  }
}

export async function inventoryHistoricalCancelRefunds(tracking?: string): Promise<{
  lines: HistoricalCancelRefundLine[]
  counts: Record<string, number>
  bucketCounts: Record<HistoricalRefundBucket, number>
  creditCount: number
  creditToman: number
  trackingMatch: HistoricalCancelRefundLine | null
}> {
  const candidates = await loadCandidates()
  const ids = candidates.map((row) => row.id)
  const primaryByBooking = await loadPrimaryPaymentsByBookingId(candidates)
  const primaryPaymentIds = [...new Set([...primaryByBooking.values()].map((row) => row.id))]
  const allCreditIds = [...new Set([...ids, ...primaryPaymentIds])]
  const [sums, keys, debits] = await Promise.all([
    creditSums(allCreditIds),
    reconKeys(ids),
    walletDebitInfo(ids),
  ])
  let trackingBookingId: string | null = null
  if (tracking) {
    const bookings = await prisma.booking.findMany({ select: { id: true } })
    trackingBookingId = bookings.find((row) => bookingTrackingCode(row.id) === tracking)?.id || null
  }

  const lines: HistoricalCancelRefundLine[] = []
  const counts: Record<string, number> = {}
  const bucketCounts: Record<HistoricalRefundBucket, number> = {
    credit: 0,
    skip: 0,
    review: 0,
    series_gap: 0,
  }
  let creditCount = 0
  let creditToman = 0
  let trackingMatch: HistoricalCancelRefundLine | null = null

  for (const row of candidates) {
    const meta = parseMeta(row.metadataJson)
    const seriesFields = seriesInventoryFields(row, primaryByBooking, sums)
    const refundCreditSum = sums.get(seriesFields.creditTargetPaymentId) || sums.get(row.id) || 0
    const owed = cancelWalletCreditAmount({
      method: row.method,
      bookingPaymentMethod: row.booking?.paymentMethod,
      paymentAmount: row.amount,
      primaryAmount: seriesFields.primaryAmount,
      sessionPrice: seriesFields.sessionPrice,
      alreadyRefundedOnPrimary: seriesFields.alreadyRefundedOnPrimary,
      treatAsSeries: seriesFields.treatAsSeries,
      metadata: meta,
    }).amount

    const decision = decideHistoricalCancelRefund({
      method: row.method,
      bookingPaymentMethod: row.booking?.paymentMethod,
      paymentStatus: row.status,
      bookingStatus: row.booking?.status,
      amount: row.amount,
      userId: row.userId || row.booking?.userId || null,
      debitedWalletUserId: debits.payer.get(row.id) || null,
      walletDebitAbs: debits.abs.get(row.id) || 0,
      metadata: meta,
      refundCreditSum,
      alreadyReconciled: keys.has(historicalRefundIdempotencyKey(row.id)),
      primaryAmount: seriesFields.primaryAmount,
      sessionPrice: seriesFields.sessionPrice,
      alreadyRefundedOnPrimary: seriesFields.alreadyRefundedOnPrimary,
      treatAsSeries: seriesFields.treatAsSeries || undefined,
    })
    const phase3Bucket = classifyHistoricalRefundBucket({
      decision,
      method: row.method,
      paymentAmount: row.amount,
      bookingStatus: row.booking?.status,
      metadata: meta,
      owedAmount: owed,
      creditedAmount: refundCreditSum,
      walletDebitAbs: debits.abs.get(row.id) || 0,
      primaryPaymentStatus: seriesFields.primaryPaymentStatus,
      isSeriesSiblingRow: seriesFields.isSeriesSibling,
    })
    const line: HistoricalCancelRefundLine = {
      paymentId: row.id,
      bookingId: row.bookingId,
      decision,
      bucket: phase3Bucket,
      owedAmount: owed,
      creditedAmount: refundCreditSum,
      primaryPaymentId: seriesFields.creditTargetPaymentId !== row.id
        ? seriesFields.creditTargetPaymentId
        : null,
    }
    lines.push(line)
    const bucket = `${decision.action}:${decision.reason}`
    counts[bucket] = (counts[bucket] || 0) + 1
    bucketCounts[phase3Bucket] += 1
    if (decision.action === 'credit') {
      creditCount += 1
      creditToman += decision.amount
    }
    if (trackingBookingId && row.bookingId === trackingBookingId) trackingMatch = line
  }

  return { lines, counts, bucketCounts, creditCount, creditToman, trackingMatch: tracking ? trackingMatch : null }
}

/** Phase 3 — dry-run inventory only (credit / skip / review / series_gap). Never writes. */
export async function runPhase3CancelRefundInventory(opts?: {
  tracking?: string
  clubSlug?: string
  sampleLimit?: number
}) {
  const report = await inventoryHistoricalCancelRefunds(opts?.tracking)
  const sampleLimit = Math.max(1, Math.min(50, opts?.sampleLimit ?? 25))
  const samples: Record<HistoricalRefundBucket, HistoricalCancelRefundLine[]> = {
    credit: [],
    skip: [],
    review: [],
    series_gap: [],
  }
  for (const line of report.lines) {
    const bucketList = samples[line.bucket]
    if (bucketList.length < sampleLimit) bucketList.push(line)
  }
  let clubFilter: string | null = opts?.clubSlug?.trim() || null
  if (clubFilter) {
    const club = await prisma.club.findUnique({ where: { slug: clubFilter }, select: { id: true } })
    if (!club) clubFilter = null
  }
  return {
    dryRun: true,
    clubSlug: clubFilter,
    creditCount: report.creditCount,
    creditToman: report.creditToman,
    bucketCounts: report.bucketCounts,
    decisionCounts: report.counts,
    samples,
    trackingMatch: report.trackingMatch,
  }
}

async function applyCredit(line: HistoricalCancelRefundLine, opts?: { force?: boolean }): Promise<boolean> {
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
    const debitRows = await tx.walletTransaction.findMany({
      where: { paymentId: payment.id, type: { in: ['PAYMENT_DEBIT', 'IPG_BOOKING_DEBIT'] } },
      select: { amount: true, wallet: { select: { userId: true } } },
      orderBy: { createdAt: 'asc' },
    })
    const walletDebitAbs = debitRows.reduce((sum, row) => sum + Math.abs(row.amount || 0), 0)
    const debitedWalletUserId = debitRows[0]?.wallet?.userId || null
    const userId = debitedWalletUserId || payment.userId || payment.booking?.userId || null
    // force: ops-approved closed-loop credit even when stale gateway reverse flags would skip.
    const again = opts?.force && line.decision.action === 'credit'
      ? line.decision
      : decideHistoricalCancelRefund({
        method: payment.method,
        bookingPaymentMethod: payment.booking?.paymentMethod,
        paymentStatus: payment.status,
        bookingStatus: payment.booking?.status,
        amount: payment.amount,
        userId,
        debitedWalletUserId,
        walletDebitAbs,
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

async function listLedgerShortfalls() {
  // Same idea as scripts/sql/trace-wallet-cancel-lost-refund.sql section (b):
  // wallet was debited for a booking payment and never got a matching REFUND_CREDIT.
  return prisma.$queryRaw<Array<{
    paymentId: string
    bookingId: string | null
    method: string
    paymentStatus: string
    amount: number
    debited: number
    refunded: number
    net: number
    payerUserId: string | null
  }>>`
    WITH payer AS (
      SELECT DISTINCT wt."paymentId" AS payment_id, wt."walletId" AS wallet_id
      FROM "WalletTransaction" wt
      WHERE wt."paymentId" IS NOT NULL
        AND wt.type IN ('PAYMENT_DEBIT'::"WalletTransactionType", 'IPG_BOOKING_DEBIT'::"WalletTransactionType")
    ),
    rail AS (
      SELECT
        pw.payment_id,
        MIN(w."userId") AS payer_user_id,
        COALESCE(SUM(wt.amount) FILTER (
          WHERE wt.type IN ('PAYMENT_DEBIT'::"WalletTransactionType", 'IPG_BOOKING_DEBIT'::"WalletTransactionType")
        ), 0)::int AS debited,
        COALESCE(SUM(wt.amount) FILTER (
          WHERE wt.type = 'REFUND_CREDIT'::"WalletTransactionType"
        ), 0)::int AS refunded,
        COALESCE(SUM(wt.amount) FILTER (
          WHERE wt.type IN (
            'PAYMENT_DEBIT'::"WalletTransactionType",
            'REFUND_CREDIT'::"WalletTransactionType",
            'IPG_BOOKING_CREDIT'::"WalletTransactionType",
            'IPG_BOOKING_DEBIT'::"WalletTransactionType",
            'ADJUSTMENT'::"WalletTransactionType"
          )
        ), 0)::int AS net_wallet
      FROM payer pw
      JOIN "Wallet" w ON w.id = pw.wallet_id
      JOIN "WalletTransaction" wt
        ON wt."paymentId" = pw.payment_id AND wt."walletId" = pw.wallet_id
      GROUP BY pw.payment_id, pw.wallet_id
    )
    SELECT
      p.id AS "paymentId",
      p."bookingId" AS "bookingId",
      p.method::text AS method,
      p.status::text AS "paymentStatus",
      p.amount::int AS amount,
      r.debited AS debited,
      r.refunded AS refunded,
      r.net_wallet AS net,
      r.payer_user_id AS "payerUserId"
    FROM rail r
    JOIN "Payment" p ON p.id = r.payment_id
    LEFT JOIN "Booking" b ON b.id = p."bookingId"
    WHERE COALESCE(p.purpose, 'booking') <> 'topup'
      AND r.debited < 0
      AND r.net_wallet < 0
      AND (
        b.status = 'CANCELLED'
        OR p.status IN ('REFUNDED', 'FAILED', 'SUPERSEDED')
        OR p."bookingId" IS NULL
      )
    ORDER BY p."updatedAt" DESC
    LIMIT 50
  `
}

/** Dry-run by default. `apply: true` appends wallet credits + recon rows (never deletes). */
export async function runHistoricalCancelRefundRepair(opts?: {
  apply?: boolean
  tracking?: string
  /** Ops-approved payment ids to credit even when gateway reverse flags would skip. */
  forcePaymentIds?: string[]
}): Promise<HistoricalCancelRefundReport> {
  const apply = opts?.apply === true
  const report = await inventoryHistoricalCancelRefunds(opts?.tracking)
  let ledgerShortfalls: Awaited<ReturnType<typeof listLedgerShortfalls>> = []
  try {
    ledgerShortfalls = await listLedgerShortfalls()
  }
  catch (err) {
    console.error('[historicalCancelRefundRepair] ledgerShortfalls query failed', err)
  }
  const credits = report.lines
    .filter((line) => line.decision.action === 'credit')
    .map((line) => ({
      paymentId: line.paymentId,
      bookingId: line.bookingId,
      amount: line.decision.action === 'credit' ? line.decision.amount : 0,
      reason: line.decision.reason,
    }))

  // If metadata inventory missed a ledger shortfall, synthesize a credit line so APPLY heals it.
  const creditIds = new Set(credits.map((c) => c.paymentId))
  const synthesized: HistoricalCancelRefundLine[] = []
  for (const row of ledgerShortfalls) {
    if (creditIds.has(row.paymentId)) continue
    if (!row.payerUserId) continue
    const gap = Math.max(0, Math.abs(row.net))
    if (gap <= 0) continue
    const line: HistoricalCancelRefundLine = {
      paymentId: row.paymentId,
      bookingId: row.bookingId,
      decision: { action: 'credit', amount: gap, reason: 'wallet_spend_shortfall' },
    }
    synthesized.push(line)
    credits.push({
      paymentId: row.paymentId,
      bookingId: row.bookingId,
      amount: gap,
      reason: 'wallet_spend_shortfall',
    })
    creditIds.add(row.paymentId)
  }

  // Explicit force list (closed-loop IPG cancel wrongly flagged as card reverse).
  // Amount comes from cancelWalletCreditAmount — never blind full primary for a series session.
  for (const paymentId of opts?.forcePaymentIds || []) {
    if (creditIds.has(paymentId)) continue
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { booking: { select: { userId: true, status: true, paymentMethod: true } } },
    })
    if (!payment || payment.method === 'CASH' || payment.booking?.paymentMethod === 'CASH') continue
    const userId = payment.userId || payment.booking?.userId
    if (!userId) continue
    const meta = parseMeta(payment.metadataJson)
    const seriesMeta = parseSeriesPaymentMeta(payment.metadataJson)
    let primaryAmount = payment.amount
    let alreadyOnPrimary = 0
    let creditPaymentId = payment.id
    if (isSeriesPaymentGroup(seriesMeta)) {
      const primaryBookingId = seriesMeta.coveredByBookingId
        || seriesMeta.groupPrimaryBookingId
        || payment.bookingId
      if (primaryBookingId) {
        const primary = await prisma.payment.findUnique({ where: { bookingId: primaryBookingId } })
        if (primary) {
          creditPaymentId = primary.id
          primaryAmount = primary.amount
          const primaryMeta = parseMeta(primary.metadataJson)
          alreadyOnPrimary = Math.max(0, Math.floor(Number(primaryMeta.sessionRefundsTotal) || 0))
          const creditedPrimary = await prisma.walletTransaction.aggregate({
            where: { paymentId: primary.id, type: 'REFUND_CREDIT' },
            _sum: { amount: true },
          })
          alreadyOnPrimary = Math.max(alreadyOnPrimary, Math.max(0, creditedPrimary._sum.amount || 0))
        }
      }
    }
    if (creditIds.has(creditPaymentId)) continue
    const credited = await prisma.walletTransaction.aggregate({
      where: { paymentId: creditPaymentId, type: 'REFUND_CREDIT' },
      _sum: { amount: true },
    })
    const already = Math.max(0, credited._sum.amount || 0, alreadyOnPrimary)
    const owed = cancelWalletCreditAmount({
      method: payment.method,
      bookingPaymentMethod: payment.booking?.paymentMethod,
      paymentAmount: payment.amount,
      primaryAmount,
      alreadyRefundedOnPrimary: alreadyOnPrimary,
      metadata: meta,
    })
    const gap = Math.max(0, owed.amount - already)
    if (gap <= 0) continue
    const line: HistoricalCancelRefundLine = {
      paymentId: creditPaymentId,
      bookingId: payment.bookingId,
      decision: { action: 'credit', amount: gap, reason: 'wallet_path_shortfall' },
    }
    synthesized.push(line)
    credits.push({
      paymentId: creditPaymentId,
      bookingId: payment.bookingId,
      amount: gap,
      reason: owed.series ? 'series_session_force' : 'wallet_path_shortfall',
    })
    creditIds.add(creditPaymentId)
  }

  const allCreditLines = [
    ...report.lines.filter((line) => line.decision.action === 'credit'),
    ...synthesized,
  ]
  const creditCount = allCreditLines.length
  const creditToman = allCreditLines.reduce(
    (sum, line) => sum + (line.decision.action === 'credit' ? line.decision.amount : 0),
    0,
  )

  const forcedIds = new Set(opts?.forcePaymentIds || [])
  let appliedCount = 0
  if (apply) {
    for (const line of allCreditLines) {
      if (await applyCredit(line, { force: forcedIds.has(line.paymentId) })) appliedCount += 1
    }
  }

  const cardAlreadyReversed = report.lines
    .filter((line) => line.decision.action === 'skip' && line.decision.reason === 'card_already_reversed')
    .slice(0, 10)
  const noVerified = report.lines
    .filter((line) => line.decision.action === 'unresolved' && line.decision.reason === 'no_verified_account')
    .slice(0, 10)
  const samplePayments = await prisma.payment.findMany({
    where: {
      id: {
        in: [...cardAlreadyReversed, ...noVerified].map((line) => line.paymentId),
      },
    },
    select: {
      id: true,
      bookingId: true,
      method: true,
      amount: true,
      userId: true,
      metadataJson: true,
      booking: { select: { userId: true } },
    },
  })
  const byId = new Map(samplePayments.map((row) => [row.id, row]))
  const metaKeysOf = (raw: string | null) => Object.keys(parseMeta(raw)).sort()

  return {
    applied: apply,
    creditCount,
    creditToman,
    appliedCount,
    counts: report.counts,
    credits: credits.slice(0, 50),
    trackingMatch: report.trackingMatch,
    ledgerShortfalls: ledgerShortfalls.map((row) => ({
      ...row,
      amount: Number(row.amount),
      debited: Number(row.debited),
      refunded: Number(row.refunded),
      net: Number(row.net),
    })),
    samples: {
      cardAlreadyReversed: cardAlreadyReversed.map((line) => {
        const row = byId.get(line.paymentId)
        return {
          paymentId: line.paymentId,
          bookingId: line.bookingId,
          method: row?.method || '?',
          amount: row?.amount || 0,
          userId: row?.userId || row?.booking?.userId || null,
          metaKeys: metaKeysOf(row?.metadataJson || null),
        }
      }),
      noVerifiedAccount: noVerified.map((line) => {
        const row = byId.get(line.paymentId)
        return {
          paymentId: line.paymentId,
          bookingId: line.bookingId,
          method: row?.method || '?',
          amount: row?.amount || 0,
          metaKeys: metaKeysOf(row?.metadataJson || null),
        }
      }),
    },
  }
}
