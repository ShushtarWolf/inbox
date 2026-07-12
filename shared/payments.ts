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

export function resolvePaymentProvider(explicit?: string): PaymentProvider {
  const mode = getPaymentsMode()
  if (mode === 'pay_at_club') return 'pay_at_club'
  const configured = process.env.PAYMENT_PROVIDER as PaymentProvider | undefined
  if (explicit && ['zarinpal', 'idpay', 'log', 'pay_at_club'].includes(explicit)) {
    return explicit as PaymentProvider
  }
  if (configured && ['zarinpal', 'idpay', 'log'].includes(configured)) return configured
  if (mode === 'test') return 'log'
  return 'zarinpal'
}
