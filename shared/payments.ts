export const PAYMENT_CURRENCY = 'IRR' as const

export type PaymentProvider = 'pay_at_club' | 'sep' | 'idpay' | 'log'

export interface PaymentConfirmOptions {
  /** SEP bank RefNum from callback (required for live verify). */
  refNum?: string
}

export type PaymentIntentStatus =
  | 'PAY_AT_CLUB'
  | 'PENDING_AT_CLUB'
  | 'PENDING_ONLINE'
  | 'PAID'
  | 'FAILED'
  | 'REFUNDED'

export type PaymentsMode = 'pay_at_club' | 'test' | 'live'

export interface PaymentIntent {
  id: string
  amount: number
  currency: typeof PAYMENT_CURRENCY
  status: PaymentIntentStatus
  provider: PaymentProvider
  providerRef?: string
  redirectUrl?: string
}

export interface CheckoutSession {
  paymentId: string
  intent: PaymentIntent
  mode: PaymentsMode
}

export interface PaymentCreateInput {
  amount: number
  bookingId?: string
  coachSessionId?: string
  packageBookingId?: string
  idempotencyKey: string
}

export interface PaymentService {
  readonly name: PaymentProvider
  createIntent(input: PaymentCreateInput): Promise<CheckoutSession>
  confirm(providerRef: string, opts?: PaymentConfirmOptions): Promise<PaymentIntent>
  refund(paymentId: string): Promise<PaymentIntent>
  getStatus(paymentId: string): Promise<PaymentIntent>
  verifyWebhook?(_payload: unknown): boolean
}

export function getPaymentsMode(): PaymentsMode {
  const mode = process.env.PAYMENTS_MODE
  if (mode === 'test' || mode === 'live') return mode
  return 'pay_at_club'
}

/**
 * Resolve which payment provider to use.
 * When `explicit` is set (e.g. stored payment.provider on refund/callback),
 * honor it even if current mode is pay_at_club — so historical IPG rows
 * still hit the correct adapter.
 */
export function resolvePaymentProvider(explicit?: string): PaymentProvider {
  if (explicit && ['sep', 'idpay', 'log', 'pay_at_club'].includes(explicit)) {
    return explicit as PaymentProvider
  }
  const mode = getPaymentsMode()
  if (mode === 'pay_at_club') return 'pay_at_club'
  const configured = process.env.PAYMENT_PROVIDER as PaymentProvider | undefined
  if (configured && ['sep', 'idpay', 'log', 'pay_at_club'].includes(configured)) return configured
  // test + live default to SEP (real adapter; simulate gateway when no terminal id).
  // Set PAYMENT_PROVIDER=log for API-only tests without redirect.
  return 'sep'
}
