#!/usr/bin/env node
/**
 * READ-ONLY wallet balance audit for the live inbox app (ff8889de schema).
 *
 *   node /tmp/audit-wallet-balances.cjs
 *   TRACKING=1541908 node /tmp/audit-wallet-balances.cjs
 *   INCLUDE_WALLET=cmsvsemi8000ys637h35mlxth node /tmp/audit-wallet-balances.cjs
 *
 * Uses process DATABASE_URL and does not print it. The first statement sets
 * the transaction read-only. There is no apply, bank call, or migration.
 *
 * A raw sum of every ledger row is not the balance. HOLD, RELEASE, LOCK,
 * UNLOCK, and WITHDRAW_PAID do not change the total. WITHDRAW_PAID consumes
 * the PAID withdraw-request amount, because the row itself stores 0.
 * This script does not set a wallet to the raw sum and does not turn that
 * gap into a refund.
 */
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')

const NON_DELTA = ['WITHDRAW_HOLD', 'WITHDRAW_RELEASE', 'LOCK', 'UNLOCK', 'WITHDRAW_PAID']
const KNOWN_DELTA = [
  'REFUND_CREDIT', 'PAYMENT_DEBIT', 'ADJUSTMENT', 'TOPUP_CREDIT', 'SETTLEMENT_CREDIT',
  'SETTLEMENT_CLAWBACK', 'BOOKING_CREDIT', 'CLAWBACK', 'INTERNAL_TRANSFER_IN', 'INTERNAL_TRANSFER_OUT',
]
const DETAIL_CAP = 30

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

function num(value) {
  return Math.floor(Number(value) || 0)
}

function decide(row) {
  const stored = num(row.storedBalance)
  const available = num(row.availableBalance)
  const locked = num(row.lockedBalance)
  const signed = num(row.signedSum)
  const naive = num(row.naiveSum)
  const nonDelta = num(row.nonDeltaSum)
  const paid = num(row.withdrawPaidToman)
  const unknownTypes = String(row.unknownTypes || '').split(',').map((s) => s.trim()).filter(Boolean)
  const identityOk = stored === available + locked
  const semanticExpected = signed - paid
  const delta = semanticExpected - stored
  const reasons = []
  if (!identityOk) reasons.push('balance_ne_available_plus_locked')
  if (unknownTypes.length) reasons.push('unknown_transaction_type')
  if (num(row.withdrawPaidNonZeroRows) > 0) reasons.push('withdraw_paid_row_amount_nonzero')
  if (paid < 0) reasons.push('withdraw_paid_negative')
  if (!reasons.length && delta !== 0 && available + delta < 0) reasons.push('available_would_go_negative')
  const confidence = reasons.length ? 'insufficient' : 'high'
  return {
    walletId: row.walletId,
    kind: row.kind,
    ownerId: row.ownerId,
    storedBalance: stored,
    availableBalance: available,
    lockedBalance: locked,
    identityOk,
    txCount: num(row.txCount),
    naiveSum: naive,
    naiveGap: naive - stored,
    nonDeltaAmountSum: nonDelta,
    deltaAmountSum: signed,
    withdrawPaidToman: paid,
    unknownTypes,
    semanticExpected,
    delta,
    confidence,
    insufficientReasons: reasons,
    naiveGapExplainedByNonDelta: delta === 0 && (naive - stored) === nonDelta,
    proposal: confidence === 'high' && delta !== 0
      ? { appendAmount: delta, rowAmount: 0, type: 'ADJUSTMENT', note: `balance-semantic-gap:${row.walletId}`, moves: 'balance_and_available' }
      : null,
  }
}

function sqlList(values) {
  return values.map((value) => `'${value}'`).join(',')
}

function walletSql(kind) {
  const wallet = kind === 'club' ? '"ClubWallet"' : '"Wallet"'
  const tx = kind === 'club' ? '"ClubWalletTransaction"' : '"WalletTransaction"'
  const owner = kind === 'club' ? '"clubId"' : '"userId"'
  const paidTable = kind === 'club' ? '"WithdrawRequest"' : '"UserWithdrawRequest"'
  const paidOwner = kind === 'club' ? '"clubId"' : '"userId"'
  return `
    SELECT w.id AS "walletId", w.${owner} AS "ownerId",
           w.balance AS "storedBalance", w."availableBalance", w."lockedBalance",
           COALESCE(s.signed_sum, 0) AS "signedSum",
           COALESCE(n.naive_sum, 0) AS "naiveSum",
           COALESCE(nd.non_delta_sum, 0) AS "nonDeltaSum",
           COALESCE(p.paid_sum, 0) AS "withdrawPaidToman",
           COALESCE(z.nonzero_paid_rows, 0) AS "withdrawPaidNonZeroRows",
           COALESCE(u.unknown_types, '') AS "unknownTypes",
           COALESCE(c.tx_count, 0) AS "txCount"
    FROM ${wallet} w
    LEFT JOIN (
      SELECT "walletId", SUM(amount)::bigint AS signed_sum
      FROM ${tx}
      WHERE type::text NOT IN (${sqlList(NON_DELTA)})
      GROUP BY "walletId"
    ) s ON s."walletId" = w.id
    LEFT JOIN (
      SELECT "walletId", SUM(amount)::bigint AS naive_sum, COUNT(*)::int AS tx_count
      FROM ${tx} GROUP BY "walletId"
    ) n ON n."walletId" = w.id
    LEFT JOIN (
      SELECT "walletId", SUM(amount)::bigint AS non_delta_sum
      FROM ${tx}
      WHERE type::text IN (${sqlList(NON_DELTA)})
      GROUP BY "walletId"
    ) nd ON nd."walletId" = w.id
    LEFT JOIN (
      SELECT ${paidOwner} AS owner_id, SUM(amount)::bigint AS paid_sum
      FROM ${paidTable} WHERE status = 'PAID' GROUP BY ${paidOwner}
    ) p ON p.owner_id = w.${owner}
    LEFT JOIN (
      SELECT "walletId", COUNT(*)::int AS nonzero_paid_rows
      FROM ${tx} WHERE type::text = 'WITHDRAW_PAID' AND amount <> 0
      GROUP BY "walletId"
    ) z ON z."walletId" = w.id
    LEFT JOIN (
      SELECT "walletId", STRING_AGG(DISTINCT type::text, ',') AS unknown_types
      FROM ${tx}
      WHERE type::text NOT IN (${sqlList([...NON_DELTA, ...KNOWN_DELTA])})
      GROUP BY "walletId"
    ) u ON u."walletId" = w.id
    LEFT JOIN (
      SELECT "walletId", COUNT(*)::int AS tx_count FROM ${tx} GROUP BY "walletId"
    ) c ON c."walletId" = w.id
  `
}

function metaFlag(raw, key) {
  if (!raw || !raw.includes(`"${key}"`)) return false
  return new RegExp(`"${key}"\\s*:\\s*true`).test(raw)
}

function classifyCancel(row) {
  const meta = row.metadataJson || ''
  const cancelled = row.status === 'REFUNDED' || row.bookingStatus === 'CANCELLED'
  const cash = row.method === 'CASH' || row.bookingPaymentMethod === 'CASH'
  const reversed = metaFlag(meta, 'gatewayReversed') || metaFlag(meta, 'gatewayRefund')
  const pending = metaFlag(meta, 'reversePending') && !reversed
  const walletPath = row.method === 'PAID'
    || meta.includes('"refundChannel":"wallet_closed_loop"')
    || meta.includes('"reverseFailedAt"')
  if (cash) return 'cash'
  if (!cancelled) return 'not_cancelled'
  if (pending) return 'bank_outcome_pending'
  if (!row.userId && !row.bookingUserId) return 'no_verified_account'
  if (reversed) return 'card_already_reversed'
  if (!walletPath) return 'bank_outcome_unknown'
  return 'other_cancelled'
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is unset. Use the inbox app shell. Do not paste a URL.')
    process.exit(2)
  }
  const include = new Set((process.env.INCLUDE_WALLET || '').split(',').map((s) => s.trim()).filter(Boolean))
  const tracking = (process.env.TRACKING || '').trim()
  const { PrismaClient } = loadPrisma()
  const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })
  if (process.env.AUDIT_DEBUG === '1') {
    for (const kind of ['club', 'athlete']) {
      try {
        const rows = await prisma.$queryRawUnsafe(`${walletSql(kind)} LIMIT 1`)
        console.error(kind, 'ok', rows.length)
      } catch (err) {
        console.error(kind, 'fail', err.meta || err.message || err)
      }
    }
    await prisma.$disconnect()
    return
  }
  try {
    const report = await prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(`SELECT set_config('transaction_read_only', 'on', true)`)
      const flag = await tx.$queryRawUnsafe(`SELECT current_setting('transaction_read_only') AS v`)
      if (flag[0]?.v !== 'on') throw new Error('read-only guard did not engage')

      const clubs = (await tx.$queryRawUnsafe(walletSql('club'))).map((row) => decide({ ...row, kind: 'club' }))
      const athletes = (await tx.$queryRawUnsafe(walletSql('athlete'))).map((row) => decide({ ...row, kind: 'athlete' }))
      const all = [...clubs, ...athletes]
      const interesting = all.filter((row) => (
        include.has(row.walletId)
        || row.delta !== 0
        || !row.identityOk
        || row.confidence !== 'high'
        || row.naiveGap !== 0
      ))
      interesting.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || Math.abs(b.naiveGap) - Math.abs(a.naiveGap))

      const payments = await tx.$queryRawUnsafe(`
        SELECT p.id, p.method, p.status, p.amount, p."userId", p."metadataJson",
               b.status AS "bookingStatus", b."paymentMethod" AS "bookingPaymentMethod",
               b."userId" AS "bookingUserId"
        FROM "Payment" p
        LEFT JOIN "Booking" b ON b.id = p."bookingId"
        WHERE p.status = 'REFUNDED' OR b.status = 'CANCELLED'
           OR p.method IN ('IPG', 'CASH') OR p.provider = 'sep'
      `)
      const legacyUnknown = []
      const widerUnknown = []
      let noAccountAmount = 0
      let noAccountCount = 0
      const noAccountSamples = []
      for (const payment of payments) {
        const legacy = payment.status === 'REFUNDED' || payment.bookingStatus === 'CANCELLED'
        const legacyMethod = ['IPG', 'PAID', 'CASH'].includes(payment.method)
        const wider = payment.method === 'IPG' || payment.method === 'CASH' || payment.provider === 'sep'
        const klass = classifyCancel(payment)
        if (legacy && legacyMethod && klass === 'bank_outcome_unknown') legacyUnknown.push(payment.id)
        if (wider && klass === 'bank_outcome_unknown') widerUnknown.push(payment.id)
        if (!payment.userId && !payment.bookingUserId && Number(payment.amount) > 0 && payment.method === 'IPG') {
          noAccountCount += 1
          noAccountAmount += num(payment.amount)
          if (noAccountSamples.length < 20) noAccountSamples.push(payment.id)
        }
      }
      const legacySet = new Set(legacyUnknown)
      const widerSet = new Set(widerUnknown)

      let trackingResult = null
      if (tracking) {
        const bookings = await tx.$queryRawUnsafe(`SELECT id, "userId" FROM "Booking"`)
        const match = bookings.filter((row) => bookingTrackingCode(row.id) === tracking)
        trackingResult = {
          code: tracking,
          matchCount: match.length,
          bookingIds: match.slice(0, 5).map((row) => row.id),
          wallet: match.length === 1
            ? athletes.find((row) => row.ownerId === match[0].userId) || null
            : null,
          refundCreditFromCardReversal: null,
          reason: 'Card-reversal flags do not prove the bank failed to return the money. No duplicate wallet refund is proposed from this script.',
        }
      }

      const typeRows = await tx.$queryRawUnsafe(`
        SELECT "walletId", type::text AS type, COUNT(*)::int AS count, SUM(amount)::bigint AS "amountSum"
        FROM "ClubWalletTransaction"
        GROUP BY "walletId", type
        UNION ALL
        SELECT "walletId", type::text AS type, COUNT(*)::int AS count, SUM(amount)::bigint AS "amountSum"
        FROM "WalletTransaction"
        GROUP BY "walletId", type
        ORDER BY 1, 2
      `)
      const byWallet = new Map()
      for (const row of typeRows) {
        const list = byWallet.get(row.walletId) || []
        list.push({ type: row.type, count: num(row.count), amountSum: num(row.amountSum) })
        byWallet.set(row.walletId, list)
      }

      return {
        mode: 'read-only-balance-audit',
        unit: 'toman',
        readOnly: true,
        applied: false,
        bankCalled: false,
        formula: 'semanticExpected = sum(amount of delta types) - sum(PAID withdraw requests). HOLD/RELEASE/LOCK/UNLOCK/WITHDRAW_PAID amounts are not balance deltas.',
        naiveSumIsNotTheBalance: true,
        summary: {
          wallets: all.length,
          semanticGaps: all.filter((row) => row.delta !== 0).length,
          naiveGaps: all.filter((row) => row.naiveGap !== 0).length,
          proposals: all.filter((row) => row.proposal).length,
          proposalToman: all.reduce((sum, row) => sum + (row.proposal ? row.proposal.appendAmount : 0), 0),
        },
        wallets: interesting.slice(0, DETAIL_CAP).map((row) => ({
          ...row,
          byType: byWallet.get(row.walletId) || null,
        })),
        truncated: interesting.length > DETAIL_CAP,
        cancellationUnknownScopes: {
          note: 'These counts use different payment filters. A higher wider-scope count is not evidence that new unknowns appeared.',
          legacyRepairFilter: "status REFUNDED or booking CANCELLED, method in IPG/PAID/CASH, wallet path not proven, not cash, not card-reversed, not reversePending",
          widerDryRunFilter: "method IPG or CASH or provider sep, same unresolved bank-outcome rule",
          legacyBankOutcomeUnknown: legacyUnknown.length,
          widerBankOutcomeUnknown: widerUnknown.length,
          sampleOnlyInWider: widerUnknown.filter((id) => !legacySet.has(id)).slice(0, 20),
          sampleOnlyInLegacy: legacyUnknown.filter((id) => !widerSet.has(id)).slice(0, 20),
          refundCreditsProposed: 0,
        },
        noAccountIpg: {
          count: noAccountCount,
          amountToman: noAccountAmount,
          samplePaymentIds: noAccountSamples,
          walletCreated: false,
          reason: 'No verified account. Phone numbers are not used to find one.',
        },
        tracking: trackingResult,
        exclusions: [
          'Do not set a wallet balance to the raw sum of every row.',
          'Do not derive a refund credit from a raw-sum gap.',
          'Cash stays with the club.',
          'A card-reversal flag is not a wallet refund.',
          'Neutral IPG credit/debit pairs are not a balance correction.',
        ],
      }
    }, { timeout: 120000, maxWait: 15000, isolationLevel: 'RepeatableRead' })
    process.stdout.write(`${JSON.stringify(report, (_k, v) => (typeof v === 'bigint' ? Number(v) : v), 2)}\n`)
  } finally {
    await prisma.$disconnect()
  }
}

module.exports = { decide, bookingTrackingCode }

if (require.main === module) {
  main().catch((err) => {
    const code = err && err.code ? ` ${err.code}` : ''
    const meta = err && err.meta ? ` ${JSON.stringify(err.meta).slice(0, 500)}` : ''
    const raw = err instanceof Error ? `${err.name || 'Error'}${code}: ${err.message || ''}${meta}` : 'audit failed'
    console.error(raw.replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted-url]').split('\n')[0].slice(0, 500))
    if (err && err.stack) console.error(String(err.stack).split('\n').slice(0, 4).join(' | '))
    process.exit(1)
  })
}
