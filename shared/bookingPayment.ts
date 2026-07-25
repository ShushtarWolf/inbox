import { getPaymentsMode, resolvePaymentProvider, type PaymentProvider } from './payments.ts'

export function isOnlinePaymentsEnabled(): boolean {
  return getPaymentsMode() !== 'pay_at_club'
}

export function initialPlatformPaymentFields(amount: number): {
  paymentStatus: 'PAY_AT_CLUB' | 'PENDING_ONLINE'
  payment: {
    amount: number
    method: 'CASH' | 'NOT_PAID'
    status: 'PAY_AT_CLUB' | 'PENDING_ONLINE'
    provider: PaymentProvider
  }
} {
  if (isOnlinePaymentsEnabled()) {
    return {
      paymentStatus: 'PENDING_ONLINE',
      payment: {
        amount,
        method: 'NOT_PAID',
        status: 'PENDING_ONLINE',
        provider: resolvePaymentProvider(),
      },
    }
  }
  return {
    paymentStatus: 'PAY_AT_CLUB',
    payment: {
      amount,
      method: 'CASH',
      status: 'PAY_AT_CLUB',
      provider: 'pay_at_club',
    },
  }
}

/**
 * After an IPG cancel: credit inbox wallet when there is no real bank reverse
 * (PAYMENTS_MODE=test, or simulated SEP ResNum / metadata).
 */
export function shouldCreditWalletAfterGatewayRefund(payment: {
  providerRef?: string | null
  metadataJson?: string | null
}): boolean {
  if (getPaymentsMode() !== 'live') return true
  let meta: Record<string, unknown> = {}
  if (payment.metadataJson) {
    try {
      meta = JSON.parse(payment.metadataJson) as Record<string, unknown>
    } catch {
      meta = {}
    }
  }
  if (meta.simulated || meta.simulatedRefund) return true
  const ref = payment.providerRef || ''
  if (ref.startsWith('SIM') || ref.startsWith('sep-test-')) return true
  return false
}

export function isPaymentRefundable(status: string): boolean {
  return status === 'PAID'
}

export function isPaymentPayableOnline(status: string): boolean {
  // FAILED must be retriable (test-gateway NOK / bank decline) — new checkout intent replaces the row.
  return ['PENDING_ONLINE', 'PAY_AT_CLUB', 'PENDING_AT_CLUB', 'FAILED'].includes(status)
}

export function countsTowardRevenue(bookingStatus: string, paymentStatus: string): boolean {
  return bookingStatus !== 'CANCELLED' && paymentStatus === 'PAID'
}

/** Pay-at-club / pending / failed statuses that still need collection at the desk. */
export function isUnpaidPaymentStatus(status: string | null | undefined): boolean {
  return ['PAY_AT_CLUB', 'PENDING_AT_CLUB', 'PENDING_ONLINE', 'NOT_PAID', 'FAILED'].includes(status || '')
}

export function isPaidPaymentStatus(status: string | null | undefined): boolean {
  return status === 'PAID'
}

/**
 * Map Payment.method onto Booking.paymentMethod after a status change.
 * Wallet checkouts use method `PAID`; cash desk uses `CASH`; IPG uses `IPG`.
 */
export function resolveParentPaymentMethod(
  method: string,
  status: string,
): 'IPG' | 'CASH' | 'PAID' | 'NOT_PAID' | undefined {
  if (status === 'PAID') {
    if (method === 'IPG' || method === 'CASH' || method === 'PAID') return method
  }
  if (status === 'REFUNDED') {
    if (method === 'IPG' || method === 'CASH' || method === 'PAID' || method === 'NOT_PAID') return method
  }
  return undefined
}

/** Desk / athlete statuses that can still be settled from wallet balance. */
export function isWalletPayableStatus(status: string | null | undefined): boolean {
  return ['PENDING_ONLINE', 'PAY_AT_CLUB', 'PENDING_AT_CLUB', 'FAILED'].includes(status || '')
}
