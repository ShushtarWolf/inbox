#!/usr/bin/env node
/**
 * READ-ONLY wallet-first IPG dry-run for the inbox app shell.
 *
 *   node /tmp/dry-run-wallet-first-ipg.cjs
 *
 * Uses the process DATABASE_URL. Does not print it. Opens a read-only
 * transaction and only SELECTs. There is no apply path in this file.
 * It does not call the bank, create withdrawals, or delete rows.
 *
 * Net-zero reconstruction (wallet credit + matching debit) is reported
 * separately from balance-changing refund corrections. Refund corrections
 * are not written. Club-balance drift is not an input.
 */
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')

const CAVEAT = 'Club ledger sums are not used to propose refunds. A stored club balance that disagrees with its transaction sum (one observed case: 130 rows summing 15174500 toman against a stored 1979000) must be investigated separately and must not be auto-repaired or turned into athlete credits.'

function bookingTrackingCode(bookingId) {
  const n = parseInt(createHash('sha256').update(`track:${bookingId}`).digest('hex').slice(0, 8), 16)
  return String(1000000 + (n % 9000000))
}

function loadPrisma() {
  const candidates = [
    '/app/node_modules/@prisma/client',
    '/app/.output/server/node_modules/@prisma/client',
    path.join(process.cwd(), 'node_modules/@prisma/client'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'package.json'))) return require(candidate)
  }
  return require('@prisma/client')
}

function metaNumber(meta, key) {
  const n = Number(meta[key])
  if (!Number.isFinite(n) || n < 0) return null
  return Math.floor(n)
}

function readSplit(meta) {
  if (meta.splitPay !== true) return null
  const walletDebitAmount = Math.max(0, Math.floor(Number(meta.walletDebitAmount) || 0))
  const splitFullAmount = Math.max(0, Math.floor(Number(meta.splitFullAmount) || 0) || (walletDebitAmount + Math.floor(Number(meta.ipgChargeAmount) || 0)))
  return { walletDebitAmount, splitFullAmount }
}

function ipgCapturedToman(amount, metadata) {
  const full = Math.max(0, Math.floor(Number(amount) || 0))
  const explicit = Math.floor(Number(metadata.ipgChargeAmount))
  if (Number.isFinite(explicit) && explicit > 0) return Math.min(explicit, full || explicit)
  const split = readSplit(metadata)
  if (!split) return full
  if (split.splitFullAmount > full) return full
  if (split.walletDebitAmount > 0 && split.splitFullAmount === full) return Math.max(0, full - split.walletDebitAmount)
  return full
}

function resolveOwner(paymentUserId, bookingUserId) {
  const paymentUser = (paymentUserId || '').trim() || null
  const bookingUser = (bookingUserId || '').trim() || null
  if (paymentUser && bookingUser && paymentUser !== bookingUser) return { ok: false, reason: 'owner_mismatch' }
  const userId = paymentUser || bookingUser
  if (!userId) return { ok: false, reason: 'no_account' }
  return { ok: true, userId }
}

function refundAmountFromBps(amount, refundBps) {
  const gross = Math.max(0, Math.floor(Number(amount) || 0))
  const bps = Math.max(0, Math.min(10000, Math.floor(Number(refundBps) || 0)))
  if (bps <= 0) return 0
  if (bps >= 10000) return gross
  return Math.floor((gross * bps) / 10000)
}

function cardReversed(meta) {
  return meta.gatewayReversed === true || meta.gatewayRefund === true
}

function bankPending(meta) {
  return meta.reversePending === true && meta.gatewayReversed !== true && meta.gatewayRefund !== true
}

function walletPathProven(input) {
  if (input.method === 'PAID') return true
  const meta = input.metadata
  if (cardReversed(meta) || bankPending(meta)) return false
  if (meta.refundChannel === 'wallet_closed_loop') return true
  if (typeof meta.reverseFailedAt === 'string' && meta.reverseFailedAt.trim()) return true
  return false
}

function owedAmount(input) {
  const meta = input.metadata
  const cap = Math.max(0, Math.floor(input.amount) || 0)
  const explicit = metaNumber(meta, 'refundCreditAmount') ?? metaNumber(meta, 'refundedAmount')
  if (explicit != null) return Math.min(explicit, cap)
  const bps = metaNumber(meta, 'refundBps')
  if (bps != null) return Math.min(refundAmountFromBps(cap, bps), cap)
  const series = metaNumber(meta, 'sessionRefundsTotal')
  if (series != null && series > 0) return Math.min(series, cap)
  if (input.paymentStatus === 'REFUNDED' && walletPathProven(input)) return cap
  if (input.bookingStatus === 'CANCELLED' && input.method === 'PAID' && input.paymentStatus === 'PAID') return cap
  return null
}

function decideRefund(input) {
  const cancelled = input.paymentStatus === 'REFUNDED' || input.bookingStatus === 'CANCELLED'
  const cash = input.method === 'CASH' || input.bookingPaymentMethod === 'CASH'
  if (input.alreadyReconciled) return { action: 'skip', reason: 'already_reconciled' }
  if (cash) return { action: 'skip', reason: 'cash_club_responsibility' }
  if (!cancelled) return { action: 'skip', reason: 'not_cancelled' }
  if (bankPending(input.metadata)) return { action: 'unresolved', reason: 'bank_outcome_pending' }
  if (!input.userId) return { action: 'unresolved', reason: 'no_verified_account' }
  const credited = Math.max(0, Math.floor(input.refundCreditSum) || 0)
  if (cardReversed(input.metadata)) {
    const walletRail = metaNumber(input.metadata, 'walletDebitAmount') ?? 0
    const released = input.metadata.walletDebitReleased === true
    if (!input.metadata.splitPay || walletRail <= 0 || released) return { action: 'skip', reason: 'card_already_reversed' }
    const gap = Math.max(0, Math.min(walletRail, input.amount) - credited)
    if (gap <= 0) return { action: 'skip', reason: 'already_credited' }
    return { action: 'credit', amount: gap, reason: 'split_wallet_rail_after_card_reverse' }
  }
  if (!walletPathProven(input)) return { action: 'unresolved', reason: 'bank_outcome_unknown' }
  const owed = owedAmount(input)
  if (owed == null) return { action: 'unresolved', reason: 'owed_amount_unknown' }
  const gap = Math.max(0, owed - credited)
  if (gap <= 0) return { action: 'skip', reason: 'already_credited' }
  return { action: 'credit', amount: gap, reason: input.method === 'PAID' ? 'wallet_spend_shortfall' : 'wallet_path_shortfall' }
}

function absSum(txs, type) {
  return (txs || []).filter((tx) => tx.type === type).reduce((sum, tx) => sum + Math.abs(Math.floor(Number(tx.amount) || 0)), 0)
}

function planWalletFirstHistorical(input) {
  const captured = ipgCapturedToman(input.amount, input.metadata || {})
  const owner = resolveOwner(input.paymentUserId, input.bookingUserId)
  const refundCorrection = decideRefund({
    method: input.method,
    bookingPaymentMethod: input.bookingPaymentMethod,
    paymentStatus: input.paymentStatus,
    bookingStatus: input.bookingStatus,
    amount: input.amount,
    userId: owner.ok ? owner.userId : null,
    metadata: input.metadata || {},
    refundCreditSum: input.refundCreditSum,
    alreadyReconciled: input.alreadyRefundReconciled,
  })
  const refundClubImpactToman = refundCorrection.action === 'credit'
    ? -Math.max(0, Math.floor(input.unclawedOwnerNet || 0))
    : 0
  const base = { paymentId: input.paymentId, capturedToman: captured, refundCorrection, refundClubImpactToman }
  const meta = input.metadata || {}
  if (input.purpose === 'topup') return { ...base, reconstruction: { action: 'none', reason: 'topup_preserved' } }
  if (input.method === 'CASH' || input.bookingPaymentMethod === 'CASH') return { ...base, reconstruction: { action: 'none', reason: 'cash_not_ipg' } }
  const ipg = input.method === 'IPG' || (input.provider === 'sep' && input.method !== 'CASH' && input.method !== 'PAID')
  if (!ipg) return { ...base, reconstruction: { action: 'none', reason: 'not_ipg' } }
  if (!(input.paymentStatus === 'PAID' || input.paymentStatus === 'REFUNDED')) {
    return { ...base, reconstruction: { action: 'none', reason: 'not_captured' } }
  }
  if (captured <= 0) return { ...base, reconstruction: { action: 'none', reason: 'zero_capture' } }
  if (!owner.ok) return { ...base, reconstruction: { action: 'none', reason: owner.reason } }
  const inflow = absSum(input.walletTxs, 'IPG_BOOKING_CREDIT')
  const bookingDebit = absSum(input.walletTxs, 'IPG_BOOKING_DEBIT')
  const cardReturn = absSum(input.walletTxs, 'IPG_RETURNED_TO_CARD')
  const spendableRefund = Math.max(0, Math.floor(input.refundCreditSum) || 0)
  const reversed = cardReversed(meta)
  if (bankPending(meta) && !reversed) return { ...base, reconstruction: { action: 'none', reason: 'bank_outcome_pending' } }
  if (reversed && spendableRefund > 0) return { ...base, reconstruction: { action: 'none', reason: 'reversed_and_spendable_refund_both_present' } }
  if (reversed) {
    if ((inflow >= captured && cardReturn >= captured) || (inflow >= captured && bookingDebit >= captured)) {
      return { ...base, reconstruction: { action: 'none', reason: 'already_reconstructed' } }
    }
    if ((inflow > 0 && inflow < captured) || (cardReturn > 0 && cardReturn < captured) || (inflow > 0 && cardReturn === 0 && bookingDebit === 0)) {
      return { ...base, reconstruction: { action: 'none', reason: 'inflow_without_matching_outflow' } }
    }
    return {
      ...base,
      reconstruction: {
        action: 'pair', kind: 'card_returned', userId: owner.userId, amount: captured,
        creditType: 'IPG_BOOKING_CREDIT', debitType: 'IPG_RETURNED_TO_CARD', netWalletToman: 0, netClubToman: 0,
      },
    }
  }
  const active = input.bookingStatus !== 'CANCELLED' && input.paymentStatus === 'PAID'
  const cancelProven = input.bookingStatus === 'CANCELLED' || input.paymentStatus === 'REFUNDED'
  if (!active && !cancelProven) return { ...base, reconstruction: { action: 'none', reason: 'not_captured' } }
  if (cancelProven && refundCorrection.action === 'unresolved' && refundCorrection.reason === 'bank_outcome_unknown') {
    return { ...base, reconstruction: { action: 'none', reason: 'bank_outcome_unknown' } }
  }
  if (inflow >= captured && bookingDebit >= captured) return { ...base, reconstruction: { action: 'none', reason: 'already_reconstructed' } }
  if (bookingDebit === 0 && inflow === 0 && absSum(input.walletTxs, 'PAYMENT_DEBIT') >= captured) {
    return { ...base, reconstruction: { action: 'none', reason: 'existing_debit_without_inflow' } }
  }
  if (inflow > 0 && bookingDebit < captured) return { ...base, reconstruction: { action: 'none', reason: 'inflow_without_matching_outflow' } }
  if (bookingDebit > 0 && inflow < captured) return { ...base, reconstruction: { action: 'none', reason: 'existing_debit_without_inflow' } }
  return {
    ...base,
    reconstruction: {
      action: 'pair', kind: 'booking_ledger', userId: owner.userId, amount: captured,
      creditType: 'IPG_BOOKING_CREDIT', debitType: 'IPG_BOOKING_DEBIT', netWalletToman: 0, netClubToman: 0,
    },
  }
}

function parseMeta(raw) {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function bump(map, key, toman) {
  const row = map[key] || { count: 0, toman: 0 }
  row.count += 1
  row.toman += toman
  map[key] = row
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is unset. Use the inbox app shell. Do not paste a URL.')
    process.exit(2)
  }
  const { PrismaClient } = loadPrisma()
  const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })
  const tracking = (process.env.TRACKING || '').trim()
  try {
    const report = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('transaction_read_only', 'on', true)`
      const flag = await tx.$queryRaw`SELECT current_setting('transaction_read_only') AS v`
      if (flag[0]?.v !== 'on') throw new Error('read-only guard did not engage')
      const payments = await tx.$queryRaw`
        SELECT p.id, p.amount, p.method, p.provider, p.purpose, p.status,
               p."userId" AS "paymentUserId", p."bookingId" AS "bookingId",
               p."metadataJson" AS "metadataJson", p."createdAt" AS "createdAt",
               b.status AS "bookingStatus", b."userId" AS "bookingUserId",
               b."paymentMethod" AS "bookingPaymentMethod"
        FROM "Payment" p
        LEFT JOIN "Booking" b ON b.id = p."bookingId"
        WHERE p.method IN ('IPG', 'CASH') OR p.provider = 'sep'
      `
      const txs = await tx.$queryRaw`
        SELECT "paymentId", type, amount, note
        FROM "WalletTransaction"
        WHERE "paymentId" IS NOT NULL
      `
      const ledgers = await tx.$queryRaw`
        SELECT "paymentId", "ownerNet", "clawedBackAt"
        FROM "SettlementLedgerEntry"
      `
      let trackingBookingId = null
      if (tracking) {
        const bookings = await tx.$queryRaw`SELECT id FROM "Booking"`
        trackingBookingId = bookings.find((row) => bookingTrackingCode(row.id) === tracking)?.id || null
      }
      const byPayment = new Map()
      const refundSum = new Map()
      const reconciled = new Set()
      for (const row of txs) {
        if (!row.paymentId) continue
        const list = byPayment.get(row.paymentId) || []
        list.push({ type: row.type, amount: Number(row.amount) })
        byPayment.set(row.paymentId, list)
        if (row.type === 'REFUND_CREDIT') refundSum.set(row.paymentId, (refundSum.get(row.paymentId) || 0) + Number(row.amount))
        if (row.note === `recon:historical-cancel:${row.paymentId}`) reconciled.add(row.paymentId)
      }
      const unclawed = new Map(ledgers.filter((row) => !row.clawedBackAt).map((row) => [row.paymentId, Number(row.ownerNet)]))
      const reconstructionBuckets = {}
      const refundBuckets = {}
      let pairCount = 0
      let pairGross = 0
      let cardCount = 0
      let cardGross = 0
      let refundCount = 0
      let refundToman = 0
      let refundClub = 0
      const samples = {}
      for (const payment of payments) {
        if (tracking && payment.bookingId !== trackingBookingId) continue
        const plan = planWalletFirstHistorical({
          paymentId: payment.id,
          method: payment.method,
          provider: payment.provider,
          purpose: payment.purpose,
          paymentStatus: payment.status,
          bookingStatus: payment.bookingStatus,
          bookingPaymentMethod: payment.bookingPaymentMethod,
          amount: Number(payment.amount),
          paymentUserId: payment.paymentUserId,
          bookingUserId: payment.bookingUserId,
          metadata: parseMeta(payment.metadataJson),
          walletTxs: byPayment.get(payment.id) || [],
          refundCreditSum: refundSum.get(payment.id) || 0,
          alreadyRefundReconciled: reconciled.has(payment.id),
          unclawedOwnerNet: unclawed.get(payment.id) ?? 0,
        })
        if (plan.reconstruction.action === 'pair') {
          bump(reconstructionBuckets, plan.reconstruction.kind, plan.reconstruction.amount)
          if (plan.reconstruction.kind === 'card_returned') {
            cardCount += 1
            cardGross += plan.reconstruction.amount
          } else {
            pairCount += 1
            pairGross += plan.reconstruction.amount
          }
          const key = `reconstruction:${plan.reconstruction.kind}`
          samples[key] = [...(samples[key] || []), payment.id].slice(0, 20)
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
          const key = `refund:${plan.refundCorrection.reason}`
          samples[key] = [...(samples[key] || []), payment.id].slice(0, 20)
        }
      }
      return {
        mode: 'dry-run',
        unit: 'toman',
        readOnly: true,
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
        tracking: tracking ? { code: tracking, bookingId: trackingBookingId } : null,
        caveat: CAVEAT,
      }
    }, { timeout: 120000, maxWait: 15000, isolationLevel: 'RepeatableRead' })
    process.stdout.write(`${JSON.stringify(report, (_k, v) => (typeof v === 'bigint' ? Number(v) : v), 2)}\n`)
  } finally {
    await prisma.$disconnect()
  }
}

module.exports = { planWalletFirstHistorical, bookingTrackingCode }

if (require.main === module) {
  main().catch((err) => {
    const message = err instanceof Error ? err.message : 'dry-run failed'
    console.error(message.replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted-url]').split('\n')[0])
    process.exit(1)
  })
}
