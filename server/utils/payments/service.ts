import type { CheckoutSession, PaymentIntent, PaymentProvider } from '#shared/payments.ts'
import { getPaymentsMode, PAYMENT_CURRENCY } from '#shared/payments.ts'
import { zarinpalProvider } from './providers/zarinpal'

export interface PaymentService {
  createIntent(input: {
    amount: number
    bookingId?: string
    coachSessionId?: string
    idempotencyKey: string
  }): Promise<CheckoutSession>
  confirm(providerRef: string): Promise<PaymentIntent>
  refund(paymentId: string): Promise<PaymentIntent>
  getStatus(paymentId: string): Promise<PaymentIntent>
}

const providers: Record<string, PaymentService> = {
  pay_at_club: {
    async createIntent(input) {
      const payment = await prisma.payment.create({
        data: {
          amount: input.amount,
          method: 'NOT_PAID',
          status: 'PENDING_AT_CLUB',
          provider: 'pay_at_club',
          idempotencyKey: input.idempotencyKey,
          bookingId: input.bookingId,
          coachSessionId: input.coachSessionId,
        },
      })
      return {
        paymentId: payment.id,
        mode: getPaymentsMode(),
        intent: {
          id: payment.id,
          amount: payment.amount,
          currency: PAYMENT_CURRENCY,
          status: 'PENDING_AT_CLUB',
          provider: 'pay_at_club',
        },
      }
    },
    async confirm(providerRef) {
      const payment = await prisma.payment.update({
        where: { id: providerRef },
        data: { status: 'PAID' },
      })
      return toIntent(payment)
    },
    async refund(paymentId) {
      const payment = await prisma.payment.update({
        where: { id: paymentId },
        data: { status: 'REFUNDED' },
      })
      return toIntent(payment)
    },
    async getStatus(paymentId) {
      const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })
      return toIntent(payment)
    },
  },
  zarinpal: zarinpalProvider,
}

function toIntent(payment: {
  id: string
  amount: number
  status: string
  provider: string
  providerRef: string | null
}): PaymentIntent {
  return {
    id: payment.id,
    amount: payment.amount,
    currency: PAYMENT_CURRENCY,
    status: payment.status as PaymentIntent['status'],
    provider: payment.provider as PaymentProvider,
    providerRef: payment.providerRef || undefined,
  }
}

export function getPaymentService(provider = 'pay_at_club'): PaymentService {
  const mode = getPaymentsMode()
  if (mode === 'pay_at_club') return providers.pay_at_club!
  return providers[provider] || providers.pay_at_club!
}
