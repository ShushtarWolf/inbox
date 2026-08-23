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

/** Booking/session row shape used for athlete hub spend KPIs. */
export type AthleteSpendRow = {
  status?: string | null
  paymentStatus?: string | null
  payment?: { amount?: number | null; status?: string | null } | null
}

/**
 * Settled spend for one athlete booking/session.
 * Only PAID + non-cancelled rows count. Uses payment.amount only — never list
 * price fallbacks. Amount 0 (multi-slot siblings) stays 0 (do not use `||`).
 */
export function settledSpendAmount(row: AthleteSpendRow): number {
  const paymentStatus = row.payment?.status || row.paymentStatus || ''
  if (!countsTowardRevenue(row.status || '', paymentStatus)) return 0
  const amount = row.payment?.amount
  return typeof amount === 'number' && Number.isFinite(amount) ? amount : 0
}

/** Sum settled spend across court / coach / package rows for the athlete hub. */
export function sumAthleteSettledSpend(rows: AthleteSpendRow[]): number {
  return rows.reduce((sum, row) => sum + settledSpendAmount(row), 0)
}

/** Hub «رزروها»: non-cancelled bookings only (cancelled must not inflate the KPI). */
export function countActiveAthleteBookings(rows: Array<{ status?: string | null }>): number {
  return rows.filter((row) => (row.status || '') !== 'CANCELLED').length
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

export const PAYMENT_CHANNELS = ['IPG', 'ON_SITE'] as const
export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number]
export type ResolvedPaymentChannel = PaymentChannel | 'WALLET'

export function isPaymentChannel(value: string | undefined | null): value is PaymentChannel {
  return value === 'IPG' || value === 'ON_SITE'
}

/**
 * IPG vs pay-on-site vs wallet. Desk unpaid rows (PAY_AT_CLUB) count as on-site
 * even before Booking.paymentMethod is set.
 */
export function resolvePaymentChannel(
  method?: string | null,
  status?: string | null,
): ResolvedPaymentChannel | null {
  if (method === 'IPG') return 'IPG'
  if (method === 'PAID') return 'WALLET'
  if (method === 'CASH' || status === 'PAY_AT_CLUB' || status === 'PENDING_AT_CLUB') return 'ON_SITE'
  return null
}

/** Prisma `where` fragment for Booking: IPG vs cash/on-site. */
export function bookingPaymentChannelWhere(channel: string | undefined | null) {
  if (channel === 'IPG') {
    return {
      OR: [
        { paymentMethod: 'IPG' as const },
        { payment: { is: { method: 'IPG' as const } } },
      ],
    }
  }
  if (channel === 'ON_SITE') {
    return {
      OR: [
        { paymentMethod: 'CASH' as const },
        { payment: { is: { method: 'CASH' as const } } },
        { paymentStatus: { in: ['PAY_AT_CLUB' as const, 'PENDING_AT_CLUB' as const] } },
      ],
    }
  }
  return null
}

/** Prisma `where` fragment for Payment rows. */
export function paymentRowChannelWhere(channel: string | undefined | null) {
  if (channel === 'IPG') return { method: 'IPG' as const }
  if (channel === 'ON_SITE') return { method: 'CASH' as const }
  return null
}
