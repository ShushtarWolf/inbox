export const PAYMENT_CURRENCY = 'IRR' as const

export type PaymentProvider = 'pay_at_club' | 'zarinpal' | 'idpay'

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

export function getPaymentsMode(): PaymentsMode {
  const mode = process.env.PAYMENTS_MODE
  if (mode === 'test' || mode === 'live') return mode
  return 'pay_at_club'
}
