import { expectedWalletBalanceFromTxs, walletTxBalanceDelta } from './walletRecon.ts'

/** Row amount does not change total balance. WITHDRAW_PAID consumes via the request amount. */
export const NON_DELTA_WALLET_TYPES = [
  'WITHDRAW_HOLD',
  'WITHDRAW_RELEASE',
  'LOCK',
  'UNLOCK',
  'WITHDRAW_PAID',
] as const

export const KNOWN_DELTA_WALLET_TYPES = [
  'REFUND_CREDIT',
  'PAYMENT_DEBIT',
  'ADJUSTMENT',
  'TOPUP_CREDIT',
  'SETTLEMENT_CREDIT',
  'SETTLEMENT_CLAWBACK',
  'BOOKING_CREDIT',
  'CLAWBACK',
  'INTERNAL_TRANSFER_IN',
  'INTERNAL_TRANSFER_OUT',
] as const

export type WalletAuditTx = { type: string, amount: number }

export type WalletAuditInput = {
  walletId: string
  kind: 'athlete' | 'club'
  ownerId: string
  storedBalance: number
  availableBalance: number
  lockedBalance: number
  txs: WalletAuditTx[]
  /** Sum of PAID withdraw requests for this owner. Not the WITHDRAW_PAID row amount. */
  withdrawPaidToman: number
}

export type WalletAuditResult = {
  walletId: string
  kind: 'athlete' | 'club'
  ownerId: string
  storedBalance: number
  availableBalance: number
  lockedBalance: number
  identityOk: boolean
  txCount: number
  naiveSum: number
  naiveGap: number
  byType: Record<string, { count: number, amountSum: number }>
  nonDeltaAmountSum: number
  deltaAmountSum: number
  withdrawPaidToman: number
  withdrawPaidNonZeroRowCount: number
  unknownTypes: string[]
  semanticExpected: number
  /** semanticExpected - storedBalance. Positive means the stored balance is short. */
  delta: number
  confidence: 'high' | 'insufficient'
  insufficientReasons: string[]
  proposal: null | {
    /** How far to move stored balance and available. Not a new earning. */
    appendAmount: number
    /** The audit row stores 0 so the semantic sum does not move with the cache. */
    rowAmount: 0
    type: 'ADJUSTMENT'
    note: string
    moves: 'balance_and_available'
  }
}

export function auditWalletBalance(input: WalletAuditInput): WalletAuditResult {
  const byType: WalletAuditResult['byType'] = {}
  let naiveSum = 0
  let nonDeltaAmountSum = 0
  let deltaAmountSum = 0
  let withdrawPaidNonZeroRowCount = 0
  const unknown = new Set<string>()
  for (const tx of input.txs) {
    const amount = Math.floor(Number(tx.amount) || 0)
    const bucket = byType[tx.type] || { count: 0, amountSum: 0 }
    bucket.count += 1
    bucket.amountSum += amount
    byType[tx.type] = bucket
    naiveSum += amount
    if ((NON_DELTA_WALLET_TYPES as readonly string[]).includes(tx.type)) {
      nonDeltaAmountSum += amount
      if (tx.type === 'WITHDRAW_PAID' && amount !== 0) withdrawPaidNonZeroRowCount += 1
    } else if ((KNOWN_DELTA_WALLET_TYPES as readonly string[]).includes(tx.type)) {
      deltaAmountSum += walletTxBalanceDelta({ type: tx.type, amount })
    } else {
      unknown.add(tx.type)
      deltaAmountSum += walletTxBalanceDelta({ type: tx.type, amount })
    }
  }
  const identityOk = input.storedBalance === input.availableBalance + input.lockedBalance
  const semanticExpected = expectedWalletBalanceFromTxs(input.txs, input.withdrawPaidToman)
  const delta = semanticExpected - input.storedBalance
  const insufficientReasons: string[] = []
  if (!identityOk) insufficientReasons.push('balance_ne_available_plus_locked')
  if (unknown.size) insufficientReasons.push('unknown_transaction_type')
  if (withdrawPaidNonZeroRowCount) insufficientReasons.push('withdraw_paid_row_amount_nonzero')
  if (input.withdrawPaidToman < 0) insufficientReasons.push('withdraw_paid_negative')
  const confidence = insufficientReasons.length ? 'insufficient' : 'high'
  const availableAfter = input.availableBalance + delta
  if (confidence === 'high' && delta !== 0 && availableAfter < 0) {
    insufficientReasons.push('available_would_go_negative')
  }
  const finalConfidence = insufficientReasons.length ? 'insufficient' : confidence
  const proposal = finalConfidence === 'high' && delta !== 0
    ? {
        appendAmount: delta,
        rowAmount: 0 as const,
        type: 'ADJUSTMENT' as const,
        note: `balance-semantic-gap:${input.walletId}`,
        moves: 'balance_and_available' as const,
      }
    : null
  return {
    walletId: input.walletId,
    kind: input.kind,
    ownerId: input.ownerId,
    storedBalance: input.storedBalance,
    availableBalance: input.availableBalance,
    lockedBalance: input.lockedBalance,
    identityOk,
    txCount: input.txs.length,
    naiveSum,
    naiveGap: naiveSum - input.storedBalance,
    byType,
    nonDeltaAmountSum,
    deltaAmountSum,
    withdrawPaidToman: input.withdrawPaidToman,
    withdrawPaidNonZeroRowCount,
    unknownTypes: [...unknown],
    semanticExpected,
    delta,
    confidence: finalConfidence,
    insufficientReasons,
    proposal,
  }
}

/**
 * The transcribed club figure summed every row amount. That is not the balance.
 * If the extra is exactly the non-delta rows, the stored balance needs no correction.
 */
export function naiveGapExplainedByNonDelta(result: WalletAuditResult): boolean {
  return result.delta === 0 && result.naiveGap === result.nonDeltaAmountSum
}
