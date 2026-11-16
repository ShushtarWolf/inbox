import { bookingTrackingCode } from '#shared/receiptToken.ts'
import {
  isSeriesPaymentGroup,
  parseSeriesPaymentMeta,
  type SeriesPaymentMeta,
} from '#shared/athleteSeason.ts'
import {
  decideHistoricalCancelRefund,
  historicalRefundIdempotencyKey,
  historicalRepairBucket,
  type HistoricalRefundDecision,
  type HistoricalRepairBucket,
} from '#shared/historicalRefundRepair.ts'
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
  /** Phase-3 bucket (series_gap is set when synthesized from series inventory). */
  bucket?: HistoricalRepairBucket
}

export type HistoricalCancelRefundReport = {
  applied: boolean
  creditCount: number
  creditToman: number
  appliedCount: number
  counts: Record<string, number>
  /** Phase-3 rollup: credit | skip | review | series_gap */
  buckets: Record<HistoricalRepairBucket, number>
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
  /** Cancelled series siblings whose session share was never credited on the primary. */
  seriesGaps: Array<{
    paymentId: string
    bookingId: string
    primaryPaymentId: string
    amount: number
    alreadyCredited: number
    gap: number
    autoCredit: boolean
  }>
  /** Credited more than owed (ops may ADJUSTMENT later — never auto). */
  overCredits: Array<{
    paymentId: string
    bookingId: string | null
    owed: number
    credited: number
    over: number
  }>
  /** Samples for ops review when creditCount is 0 but skips look suspicious. */
  samples: {
    cardAlreadyReversed: Array<{ paymentId: string, bookingId: string | null, method: string, amount: number, userId: string | null, metaKeys: string[] }>
    noVerifiedAccount: Array<{ paymentId: string, bookingId: string | null, method: string, amount: number, metaKeys: string[] }>
    review: Array<{ paymentId: string, bookingId: string | null, method: string, amount: number, reason: string, userId: string | null, metaKeys: string[] }>
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

/** Per payment+booking REFUND_CREDIT sum (series session credits land on primary with sibling bookingId). */
async function creditSumsByBooking(paymentIds: string[]) {
  const map = new Map<string, number>()
  if (!paymentIds.length) return map
  const rows = await prisma.walletTransaction.groupBy({
    by: ['paymentId', 'bookingId'],
    where: { paymentId: { in: paymentIds }, type: 'REFUND_CREDIT' },
    _sum: { amount: true },
  })
  for (const row of rows) {
    if (!row.paymentId || !row.bookingId) continue
    map.set(`${row.paymentId}:${row.bookingId}`, row._sum.amount || 0)
  }
  return map
}

function emptyBuckets(): Record<HistoricalRepairBucket, number> {
  return { credit: 0, skip: 0, review: 0, series_gap: 0 }
}

function seriesGroupBookingIds(meta: SeriesPaymentMeta, bookingId: string | null): string[] {
  const primary = meta.groupPrimaryBookingId || meta.coveredByBookingId || bookingId
  const siblings = Array.isArray(meta.groupSiblingBookingIds) ? meta.groupSiblingBookingIds : []
  const ids = new Set<string>()
  if (primary) ids.add(primary)
  if (bookingId) ids.add(bookingId)
  for (const id of siblings) {
    if (typeof id === 'string' && id) ids.add(id)
  }
  return [...ids]
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

async function reconKeys(paymentIds: string[], bookingIds: Array<string | null | undefined> = []) {
  if (!paymentIds.length) return new Set<string>()
  const keys = new Set<string>()
  for (const id of paymentIds) keys.add(historicalRefundIdempotencyKey(id))
  for (const paymentId of paymentIds) {
    for (const bookingId of bookingIds) {
      if (bookingId) keys.add(historicalRefundIdempotencyKey(paymentId, bookingId))
    }
  }
  const rows = await prisma.refundReconciliation.findMany({
    where: { idempotencyKey: { in: [...keys] } },
    select: { idempotencyKey: true },
  })
  return new Set(rows.map((row) => row.idempotencyKey))
}

export async function inventoryHistoricalCancelRefunds(tracking?: string): Promise<{
  lines: HistoricalCancelRefundLine[]
  counts: Record<string, number>
  buckets: Record<HistoricalRepairBucket, number>
  creditCount: number
  creditToman: number
  trackingMatch: HistoricalCancelRefundLine | null
  overCredits: HistoricalCancelRefundReport['overCredits']
}> {
  const candidates = await loadCandidates()
  const ids = candidates.map((row) => row.id)
  const bookingIds = candidates.map((row) => row.bookingId)
  const [sums, keys, debits, byBooking] = await Promise.all([
    creditSums(ids),
    reconKeys(ids, bookingIds),
    walletDebitInfo(ids),
    creditSumsByBooking(ids),
  ])

  // Batch booking statuses for series remaining-session math.
  const seriesBookingIdSet = new Set<string>()
  const paymentByBookingId = new Map<string, Candidate>()
  for (const row of candidates) {
    if (row.bookingId) paymentByBookingId.set(row.bookingId, row)
    const meta = parseSeriesPaymentMeta(row.metadataJson)
    if (!isSeriesPaymentGroup(meta)) continue
    for (const id of seriesGroupBookingIds(meta, row.bookingId)) seriesBookingIdSet.add(id)
  }
  const seriesBookingRows = seriesBookingIdSet.size
    ? await prisma.booking.findMany({
        where: { id: { in: [...seriesBookingIdSet] } },
        select: { id: true, status: true },
      })
    : []
  const bookingStatus = new Map(seriesBookingRows.map((row) => [row.id, row.status]))

  // Primary payments may not be in the cancel candidate set — load missing ones.
  const missingPrimaryBookingIds = [...seriesBookingIdSet].filter((id) => !paymentByBookingId.has(id))
  if (missingPrimaryBookingIds.length) {
    const extras = await prisma.payment.findMany({
      where: { bookingId: { in: missingPrimaryBookingIds } },
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
    for (const row of extras) {
      if (row.bookingId) paymentByBookingId.set(row.bookingId, row)
    }
    const extraIds = extras.map((row) => row.id)
    if (extraIds.length) {
      const [extraSums, extraDebits, extraByBooking] = await Promise.all([
        creditSums(extraIds),
        walletDebitInfo(extraIds),
        creditSumsByBooking(extraIds),
      ])
      for (const [k, v] of extraSums) sums.set(k, v)
      for (const [k, v] of extraDebits.abs) debits.abs.set(k, v)
      for (const [k, v] of extraDebits.payer) debits.payer.set(k, v)
      for (const [k, v] of extraByBooking) byBooking.set(k, v)
      const extraKeys = await reconKeys(extraIds, missingPrimaryBookingIds)
      for (const k of extraKeys) keys.add(k)
    }
  }

  let trackingBookingId: string | null = null
  if (tracking) {
    const bookings = await prisma.booking.findMany({ select: { id: true } })
    trackingBookingId = bookings.find((row) => bookingTrackingCode(row.id) === tracking)?.id || null
  }

  const lines: HistoricalCancelRefundLine[] = []
  const counts: Record<string, number> = {}
  const buckets = emptyBuckets()
  const overCredits: HistoricalCancelRefundReport['overCredits'] = []
  let creditCount = 0
  let creditToman = 0
  let trackingMatch: HistoricalCancelRefundLine | null = null

  for (const row of candidates) {
    const meta = parseMeta(row.metadataJson)
    const seriesMeta = parseSeriesPaymentMeta(row.metadataJson)
    const series = isSeriesPaymentGroup(seriesMeta)
    let decidePaymentId = row.id
    let paymentAmount = row.amount
    let primaryAmount: number | null = null
    let sessionPrice: number | null = seriesMeta.sessionPrice ?? null
    let alreadyRefundedOnPrimary: number | null = null
    let remainingSessionsIncludingCancelled: number | null = null
    let refundCreditSum = sums.get(row.id) || 0
    let alreadyReconciled = keys.has(historicalRefundIdempotencyKey(row.id))
      || (row.bookingId ? keys.has(historicalRefundIdempotencyKey(row.id, row.bookingId)) : false)

    if (series) {
      const primaryBookingId = seriesMeta.coveredByBookingId
        || seriesMeta.groupPrimaryBookingId
        || row.bookingId
      const groupIds = seriesGroupBookingIds(seriesMeta, row.bookingId)
      const active = groupIds.filter((id) => bookingStatus.get(id) !== 'CANCELLED').length
      // This row is cancelled (inventory only loads cancelled/refunded); include it in the denominator.
      remainingSessionsIncludingCancelled = active + (row.booking?.status === 'CANCELLED' ? 1 : 0)
      if (remainingSessionsIncludingCancelled < 1) remainingSessionsIncludingCancelled = 1

      if (primaryBookingId) {
        const primary = paymentByBookingId.get(primaryBookingId)
        if (primary) {
          decidePaymentId = primary.id
          primaryAmount = primary.amount
          paymentAmount = row.amount > 0 ? row.amount : 0
          const primaryMeta = parseSeriesPaymentMeta(primary.metadataJson)
          sessionPrice = sessionPrice ?? primaryMeta.sessionPrice ?? null
          const sessionTotal = Math.max(
            0,
            Math.floor(Number(parseMeta(primary.metadataJson).sessionRefundsTotal) || 0),
          )
          alreadyRefundedOnPrimary = Math.max(sessionTotal, sums.get(primary.id) || 0)
          // Per-session credits on primary for this cancelled booking.
          if (row.bookingId) {
            refundCreditSum = byBooking.get(`${primary.id}:${row.bookingId}`) || 0
            alreadyReconciled = keys.has(historicalRefundIdempotencyKey(primary.id, row.bookingId))
              || keys.has(historicalRefundIdempotencyKey(primary.id))
          }
          else {
            refundCreditSum = sums.get(primary.id) || 0
          }
        }
      }
    }

    const decision = decideHistoricalCancelRefund({
      method: row.method,
      bookingPaymentMethod: row.booking?.paymentMethod,
      paymentStatus: row.status,
      bookingStatus: row.booking?.status,
      amount: paymentAmount,
      userId: row.userId || row.booking?.userId || null,
      debitedWalletUserId: debits.payer.get(decidePaymentId) || debits.payer.get(row.id) || null,
      walletDebitAbs: debits.abs.get(decidePaymentId) || debits.abs.get(row.id) || 0,
      metadata: meta,
      refundCreditSum,
      alreadyReconciled,
      primaryAmount,
      sessionPrice,
      alreadyRefundedOnPrimary,
      remainingSessionsIncludingCancelled,
      treatAsSeries: series || undefined,
    })

    const bucket = series && decision.action === 'credit'
      ? 'series_gap' as const
      : historicalRepairBucket(decision)
    const line: HistoricalCancelRefundLine = {
      paymentId: series && decidePaymentId !== row.id ? decidePaymentId : row.id,
      bookingId: row.bookingId,
      decision,
      bucket,
    }
    lines.push(line)
    const detail = `${decision.action}:${decision.reason}`
    counts[detail] = (counts[detail] || 0) + 1
    buckets[bucket] += 1
    if (decision.action === 'credit') {
      creditCount += 1
      creditToman += decision.amount
    }
    // Over-credit: athlete already has more REFUND_CREDIT than owed for this cancel share.
    if (decision.action === 'skip' && decision.reason === 'already_credited' && !series) {
      const owed = cancelWalletCreditAmount({
        method: row.method,
        bookingPaymentMethod: row.booking?.paymentMethod,
        paymentAmount: row.amount,
        metadata: meta,
      }).amount
      const credited = sums.get(row.id) || 0
      if (owed > 0 && credited > owed) {
        overCredits.push({
          paymentId: row.id,
          bookingId: row.bookingId,
          owed,
          credited,
          over: credited - owed,
        })
      }
    }
    if (trackingBookingId && row.bookingId === trackingBookingId) trackingMatch = line
  }

  return {
    lines,
    counts,
    buckets,
    creditCount,
    creditToman,
    trackingMatch: tracking ? trackingMatch : null,
    overCredits: overCredits.slice(0, 50),
  }
}

async function applyCredit(line: HistoricalCancelRefundLine, opts?: {
  force?: boolean
  /** Trust the inventory decision (series/ledger synthesis already used owed helper). */
  trustDecision?: boolean
}): Promise<boolean> {
  if (line.decision.action !== 'credit') return false
  const key = historicalRefundIdempotencyKey(line.paymentId, line.bookingId)
  let wrote = false
  await prisma.$transaction(async (tx) => {
    const existing = await tx.refundReconciliation.findUnique({ where: { idempotencyKey: key } })
    if (existing) return
    // Legacy standalone key without bookingId — do not double-credit.
    if (line.bookingId) {
      const legacy = await tx.refundReconciliation.findUnique({
        where: { idempotencyKey: historicalRefundIdempotencyKey(line.paymentId) },
      })
      if (legacy) return
    }
    const payment = await tx.payment.findUnique({
      where: { id: line.paymentId },
      include: { booking: { select: { userId: true, paymentMethod: true, status: true } } },
    })
    if (!payment) return
    const credited = await tx.walletTransaction.aggregate({
      where: {
        paymentId: payment.id,
        type: 'REFUND_CREDIT',
        ...(line.bookingId ? { bookingId: line.bookingId } : {}),
      },
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
    const seriesMeta = parseSeriesPaymentMeta(payment.metadataJson)
    const trust = opts?.force === true || opts?.trustDecision === true
      || line.decision.reason === 'series_session_shortfall'
    // force / trust: ops-approved or inventory already used cancelWalletCreditAmount.
    const again = trust && line.decision.action === 'credit'
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
        treatAsSeries: isSeriesPaymentGroup(seriesMeta) || undefined,
        primaryAmount: payment.amount,
        sessionPrice: seriesMeta.sessionPrice ?? null,
        alreadyRefundedOnPrimary: Math.max(
          0,
          Math.floor(Number(parseMeta(payment.metadataJson).sessionRefundsTotal) || 0),
        ),
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
        // Prefer the cancelled booking id so series session credits are attributable.
        bookingId: line.bookingId || payment.bookingId || key,
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
  /**
   * Ops-approved payment ids (or `paymentId:bookingId`) to credit from the review bucket
   * even when gateway reverse flags would skip. Amount always via cancelWalletCreditAmount.
   */
  forcePaymentIds?: string[]
  /** Alias of forcePaymentIds — Phase-3 wording. */
  reviewPaymentIds?: string[]
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
  const buckets = { ...report.buckets }
  const credits = report.lines
    .filter((line) => line.decision.action === 'credit')
    .map((line) => ({
      paymentId: line.paymentId,
      bookingId: line.bookingId,
      amount: line.decision.action === 'credit' ? line.decision.amount : 0,
      reason: line.decision.reason,
    }))

  const creditKeys = new Set(
    credits.map((c) => `${c.paymentId}:${c.bookingId || ''}`),
  )
  const synthesized: HistoricalCancelRefundLine[] = []

  // If metadata inventory missed a ledger shortfall, synthesize a credit line so APPLY heals it.
  for (const row of ledgerShortfalls) {
    const key = `${row.paymentId}:${row.bookingId || ''}`
    if (creditKeys.has(key) || creditKeys.has(`${row.paymentId}:`)) continue
    if (!row.payerUserId) continue
    const gap = Math.max(0, Math.abs(row.net))
    if (gap <= 0) continue
    const line: HistoricalCancelRefundLine = {
      paymentId: row.paymentId,
      bookingId: row.bookingId,
      decision: { action: 'credit', amount: gap, reason: 'wallet_spend_shortfall' },
      bucket: 'credit',
    }
    synthesized.push(line)
    credits.push({
      paymentId: row.paymentId,
      bookingId: row.bookingId,
      amount: gap,
      reason: 'wallet_spend_shortfall',
    })
    creditKeys.add(key)
    buckets.credit += 1
  }

  const seriesGaps: HistoricalCancelRefundReport['seriesGaps'] = report.lines
    .filter((line) => line.bucket === 'series_gap' && line.decision.action === 'credit')
    .map((line) => ({
      paymentId: line.paymentId,
      bookingId: line.bookingId || '',
      primaryPaymentId: line.paymentId,
      amount: line.decision.action === 'credit' ? line.decision.amount : 0,
      alreadyCredited: 0,
      gap: line.decision.action === 'credit' ? line.decision.amount : 0,
      autoCredit: true,
    }))

  // Explicit review/force list (closed-loop IPG cancel wrongly flagged as card reverse).
  // Amount comes from cancelWalletCreditAmount — never blind full primary for a series session.
  const reviewIds = [...new Set([
    ...(opts?.forcePaymentIds || []),
    ...(opts?.reviewPaymentIds || []),
  ])]
  for (const rawId of reviewIds) {
    const [paymentId, bookingIdOpt] = rawId.includes(':')
      ? [rawId.slice(0, rawId.indexOf(':')), rawId.slice(rawId.indexOf(':') + 1)]
      : [rawId, '']
    const creditKey = `${paymentId}:${bookingIdOpt}`
    if (creditKeys.has(creditKey) || (!bookingIdOpt && [...creditKeys].some((k) => k.startsWith(`${paymentId}:`)))) {
      // Allow force when only a different booking share is already queued.
      if (!bookingIdOpt && creditKeys.has(`${paymentId}:`)) continue
      if (bookingIdOpt && creditKeys.has(creditKey)) continue
    }
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
    let sessionPrice = seriesMeta.sessionPrice ?? null
    let remainingSessionsIncludingCancelled: number | null = null
    const cancelledBookingId = bookingIdOpt || payment.bookingId
    if (isSeriesPaymentGroup(seriesMeta)) {
      const primaryBookingId = seriesMeta.coveredByBookingId
        || seriesMeta.groupPrimaryBookingId
        || payment.bookingId
      const groupIds = seriesGroupBookingIds(seriesMeta, payment.bookingId)
      if (groupIds.length) {
        const statuses = await prisma.booking.findMany({
          where: { id: { in: groupIds } },
          select: { id: true, status: true },
        })
        const active = statuses.filter((row) => row.status !== 'CANCELLED').length
        remainingSessionsIncludingCancelled = active + 1
      }
      if (primaryBookingId) {
        const primary = await prisma.payment.findUnique({ where: { bookingId: primaryBookingId } })
        if (primary) {
          creditPaymentId = primary.id
          primaryAmount = primary.amount
          const primaryMeta = parseMeta(primary.metadataJson)
          const primarySeries = parseSeriesPaymentMeta(primary.metadataJson)
          sessionPrice = sessionPrice ?? primarySeries.sessionPrice ?? null
          alreadyOnPrimary = Math.max(0, Math.floor(Number(primaryMeta.sessionRefundsTotal) || 0))
          const creditedPrimary = await prisma.walletTransaction.aggregate({
            where: { paymentId: primary.id, type: 'REFUND_CREDIT' },
            _sum: { amount: true },
          })
          alreadyOnPrimary = Math.max(alreadyOnPrimary, Math.max(0, creditedPrimary._sum.amount || 0))
        }
      }
      // Without sessionPrice and without a group count, refuse full-residual guess.
      if (sessionPrice == null && remainingSessionsIncludingCancelled == null) continue
    }
    const perSessionCredited = cancelledBookingId
      ? await prisma.walletTransaction.aggregate({
          where: {
            paymentId: creditPaymentId,
            bookingId: cancelledBookingId,
            type: 'REFUND_CREDIT',
          },
          _sum: { amount: true },
        })
      : null
    const alreadySession = Math.max(0, perSessionCredited?._sum.amount || 0)
    const owed = cancelWalletCreditAmount({
      method: payment.method,
      bookingPaymentMethod: payment.booking?.paymentMethod,
      paymentAmount: payment.amount,
      primaryAmount,
      sessionPrice,
      alreadyRefundedOnPrimary: alreadyOnPrimary,
      remainingSessionsIncludingCancelled: remainingSessionsIncludingCancelled ?? undefined,
      treatAsSeries: isSeriesPaymentGroup(seriesMeta) || undefined,
      metadata: (() => {
        const m = { ...meta }
        delete m.refundCreditAmount
        delete m.refundedAmount
        return m
      })(),
    })
    const gap = Math.max(0, owed.amount - alreadySession)
    if (gap <= 0) continue
    const finalKey = `${creditPaymentId}:${cancelledBookingId || ''}`
    if (creditKeys.has(finalKey)) continue
    const line: HistoricalCancelRefundLine = {
      paymentId: creditPaymentId,
      bookingId: cancelledBookingId,
      decision: {
        action: 'credit',
        amount: gap,
        reason: owed.series ? 'series_session_shortfall' : 'wallet_path_shortfall',
      },
      bucket: owed.series ? 'series_gap' : 'credit',
    }
    synthesized.push(line)
    credits.push({
      paymentId: creditPaymentId,
      bookingId: cancelledBookingId,
      amount: gap,
      reason: owed.series ? 'series_session_force' : 'wallet_path_shortfall',
    })
    creditKeys.add(finalKey)
    if (owed.series) {
      buckets.series_gap += 1
      seriesGaps.push({
        paymentId: creditPaymentId,
        bookingId: cancelledBookingId || '',
        primaryPaymentId: creditPaymentId,
        amount: owed.amount,
        alreadyCredited: alreadySession,
        gap,
        autoCredit: false,
      })
    }
    else {
      buckets.credit += 1
    }
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

  const forcedIds = new Set(reviewIds.map((id) => id.includes(':') ? id.slice(0, id.indexOf(':')) : id))
  // When ops passes force/review ids, APPLY only those lines — never also dump
  // the platform-wide auto credit inventory (would over-pay unrelated packs).
  const linesToApply = forcedIds.size > 0
    ? allCreditLines.filter((line) => forcedIds.has(line.paymentId))
    : allCreditLines
  let appliedCount = 0
  if (apply) {
    for (const line of linesToApply) {
      const forced = forcedIds.has(line.paymentId)
      if (await applyCredit(line, {
        force: forced,
        trustDecision: line.bucket === 'series_gap' || line.decision.reason === 'series_session_shortfall',
      })) {
        appliedCount += 1
      }
    }
  }

  const cardAlreadyReversed = report.lines
    .filter((line) => line.decision.action === 'skip' && line.decision.reason === 'card_already_reversed')
    .slice(0, 10)
  const noVerified = report.lines
    .filter((line) => line.decision.action === 'unresolved' && line.decision.reason === 'no_verified_account')
    .slice(0, 10)
  const reviewLines = report.lines
    .filter((line) => line.bucket === 'review' || line.decision.action === 'unresolved')
    .slice(0, 15)
  const samplePayments = await prisma.payment.findMany({
    where: {
      id: {
        in: [...cardAlreadyReversed, ...noVerified, ...reviewLines].map((line) => line.paymentId),
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
    buckets,
    credits: credits.slice(0, 50),
    trackingMatch: report.trackingMatch,
    ledgerShortfalls: ledgerShortfalls.map((row) => ({
      ...row,
      amount: Number(row.amount),
      debited: Number(row.debited),
      refunded: Number(row.refunded),
      net: Number(row.net),
    })),
    seriesGaps: seriesGaps.slice(0, 50),
    overCredits: report.overCredits,
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
      review: reviewLines.map((line) => {
        const row = byId.get(line.paymentId)
        return {
          paymentId: line.paymentId,
          bookingId: line.bookingId,
          method: row?.method || '?',
          amount: row?.amount || 0,
          reason: line.decision.reason,
          userId: row?.userId || row?.booking?.userId || null,
          metaKeys: metaKeysOf(row?.metadataJson || null),
        }
      }),
    },
  }
}
