export const PAYMENT_CURRENCY = 'IRR' as const

export type PaymentProvider = 'pay_at_club' | 'zarinpal' | 'idpay' | 'log'

export type PaymentIntentStatus =
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
  confirm(providerRef: string): Promise<PaymentIntent>
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
  if (explicit && ['zarinpal', 'idpay', 'log', 'pay_at_club'].includes(explicit)) {
    return explicit as PaymentProvider
  }
  const mode = getPaymentsMode()
  if (mode === 'pay_at_club') return 'pay_at_club'
  const configured = process.env.PAYMENT_PROVIDER as PaymentProvider | undefined
  if (configured && ['zarinpal', 'idpay', 'log', 'pay_at_club'].includes(configured)) return configured
  if (mode === 'test') return 'log'
  // live: zarinpal stub (fail-closed until credentials + live adapter)
  return 'zarinpal'
}
