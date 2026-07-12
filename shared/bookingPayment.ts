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

export function isPaymentRefundable(status: string): boolean {
  return status === 'PAID'
}

export function isPaymentPayableOnline(status: string): boolean {
  return ['PENDING_ONLINE', 'PAY_AT_CLUB', 'PENDING_AT_CLUB'].includes(status)
}

export function countsTowardRevenue(bookingStatus: string, paymentStatus: string): boolean {
  return bookingStatus !== 'CANCELLED' && paymentStatus === 'PAID'
}
