import { isPaidPaymentStatus } from './bookingPayment.ts'
import { parsePaymentMetadata } from './cancelRefund.ts'
import { shouldPreserveUnsettledCapture } from './paymentInFlight.ts'

/** A bound bank capture reference (SEP RefNum) is present. */
export function hasGatewayRef(
  payment: { gatewayRef?: string | null } | null | undefined,
): boolean {
  return Boolean(payment?.gatewayRef && String(payment.gatewayRef).trim())
}

/**
 * True when this IPG payment was actually captured — a unique bank RefNum,
 * a completed simulated confirm (non-live test gateway), or a recorded capture flag.
 * Desk mark-paid and club-wallet settlement must not treat a bare IPG+PAID row as captured.
 */
export function hasVerifiedIpgCapture(payment: {
  gatewayRef?: string | null
  metadataJson?: string | null
} | null | undefined): boolean {
  if (!payment) return false
  if (hasGatewayRef(payment)) return true
  const meta = parsePaymentMetadata(payment.metadataJson)
  if (meta.zeroAmountCheckout === true) return true
  if (meta.gatewayCaptured === true) return true
  if (meta.simulated === true && typeof meta.confirmedAt === 'string' && meta.confirmedAt.trim()) {
    return true
  }
  return false
}

/** Club/coach settlement may run for wallet-rail PAID, or for IPG only after a verified capture. */
export function canSettleOwnerForPaidPayment(payment: {
  method?: string | null
  gatewayRef?: string | null
  metadataJson?: string | null
}): boolean {
  if (payment.method === 'CASH') return false
  if (payment.method === 'IPG') return hasVerifiedIpgCapture(payment)
  return payment.method === 'PAID'
}

export const DESK_PAYMENT_METHOD_LOCKED = 'PAYMENT_METHOD_LOCKED'
export const DESK_ONLINE_PAID_MUST_CANCEL = 'ONLINE_PAID_MUST_CANCEL'
export const DESK_PAYMENT_VERIFY_PENDING = 'PAYMENT_VERIFY_PENDING'

export type DeskPaymentMethod = 'IPG' | 'CASH' | 'PAID'

export type DeskPaymentWrite = {
  method: DeskPaymentMethod
  status: 'PAID' | 'PAY_AT_CLUB'
  /** Requested IPG+PAID (or previous unpaid IPG) was coerced to CASH for a manual desk paid mark. */
  forcedCashForManualPaid: boolean
  error?: { statusCode: number; statusMessage: string }
}

function requestedMethodOf(raw?: string | null): DeskPaymentMethod | null {
  if (raw === 'IPG' || raw === 'CASH' || raw === 'PAID') return raw
  return null
}

function previousMethodOf(raw?: string | null): DeskPaymentMethod | null {
  return requestedMethodOf(raw)
}

/**
 * Resolve method + status for a desk / owner / admin manual write.
 *
 * - Unpaid pay-links stay IPG only while not PAID.
 * - Manual transition to PAID is always CASH (cash accounting, no wallet writes),
 *   unless the row already has a verified or in-flight gateway capture — those
 *   become PAID only via the verify callback, not from the desk.
 * - Method cannot be switched on an already-PAID booking (CASH ↔ IPG ↔ wallet).
 */
export function resolveDeskPaymentWrite(opts: {
  requestedMethod?: string | null
  requestedPaid?: boolean
  complimentary?: boolean
  paymentsMode?: string | null
  previousMethod?: string | null
  previousStatus?: string | null
  gatewayRef?: string | null
  metadataJson?: string | null
}): DeskPaymentWrite {
  const previousPaid = isPaidPaymentStatus(opts.previousStatus)
  const wantPaid = opts.complimentary === true || opts.requestedPaid === true
  const prevMethod = previousMethodOf(opts.previousMethod)
  const requested = requestedMethodOf(opts.requestedMethod)
  const capture = {
    gatewayRef: opts.gatewayRef,
    metadataJson: opts.metadataJson,
  }
  const verified = hasVerifiedIpgCapture(capture)
  const inFlight = shouldPreserveUnsettledCapture(capture)

  if (previousPaid) {
    const locked: DeskPaymentMethod = prevMethod || 'CASH'
    if (wantPaid) {
      if (requested && requested !== locked) {
        return {
          method: locked,
          status: 'PAID',
          forcedCashForManualPaid: false,
          error: { statusCode: 409, statusMessage: DESK_PAYMENT_METHOD_LOCKED },
        }
      }
      return { method: locked, status: 'PAID', forcedCashForManualPaid: false }
    }
    if (locked === 'IPG' || locked === 'PAID') {
      return {
        method: locked,
        status: 'PAID',
        forcedCashForManualPaid: false,
        error: { statusCode: 409, statusMessage: DESK_ONLINE_PAID_MUST_CANCEL },
      }
    }
    return { method: 'CASH', status: 'PAY_AT_CLUB', forcedCashForManualPaid: false }
  }

  if (wantPaid) {
    if (inFlight || verified) {
      return {
        method: prevMethod === 'IPG' ? 'IPG' : (prevMethod || 'IPG'),
        status: 'PAY_AT_CLUB',
        forcedCashForManualPaid: false,
        error: { statusCode: 409, statusMessage: DESK_PAYMENT_VERIFY_PENDING },
      }
    }
    const wasOrRequestedIpg = requested === 'IPG' || prevMethod === 'IPG'
    return {
      method: 'CASH',
      status: 'PAID',
      forcedCashForManualPaid: wasOrRequestedIpg,
    }
  }

  if (opts.paymentsMode === 'pay_at_club') {
    return { method: 'CASH', status: 'PAY_AT_CLUB', forcedCashForManualPaid: false }
  }
  if (requested === 'IPG' || requested === 'CASH') {
    return { method: requested, status: 'PAY_AT_CLUB', forcedCashForManualPaid: false }
  }
  if (prevMethod === 'IPG' || prevMethod === 'CASH') {
    return { method: prevMethod, status: 'PAY_AT_CLUB', forcedCashForManualPaid: false }
  }
  return { method: 'CASH', status: 'PAY_AT_CLUB', forcedCashForManualPaid: false }
}

export const ATHLETE_CANNOT_CONFIRM_CASH = 'ATHLETE_CANNOT_CONFIRM_CASH'

/**
 * Athletes (and any public self-serve body) must never confirm cash or
 * self-mark a booking PAID. Desk cash is owner / authorized staff only.
 */
export function athleteAttemptedDeskCashConfirm(
  body: {
    paymentMethod?: unknown
    paymentStatus?: unknown
    method?: unknown
    status?: unknown
  } | null | undefined,
): boolean {
  if (!body || typeof body !== 'object') return false
  const method = body.paymentMethod ?? body.method
  const status = body.paymentStatus ?? body.status
  if (method === 'CASH') return true
  if (status === 'PAID' && method !== 'IPG' && method !== 'PAID') return true
  return false
}
