import type { PaymentCreateInput, PaymentService } from '#shared/payments.ts'
import { getPaymentsMode, PAYMENT_CURRENCY } from '#shared/payments.ts'
import { registerPaymentProvider } from '../registry'
import { toPaymentIntent } from '../registry'

export function payAtClubProvider(): PaymentService {
  const provider: PaymentService = {
    name: 'pay_at_club',
    async createIntent(input: PaymentCreateInput) {
      const payment = await prisma.payment.create({
        data: {
          amount: input.amount,
          method: 'NOT_PAID',
          status: 'PAY_AT_CLUB',
          provider: 'pay_at_club',
          idempotencyKey: input.idempotencyKey,
          bookingId: input.bookingId,
          coachSessionId: input.coachSessionId,
          packageBookingId: input.packageBookingId,
        },
      })
      return {
        paymentId: payment.id,
        mode: getPaymentsMode(),
        intent: {
          id: payment.id,
          amount: payment.amount,
          currency: PAYMENT_CURRENCY,
          status: 'PAY_AT_CLUB',
          provider: 'pay_at_club',
        },
      }
    },
    async confirm(providerRef) {
      const payment = await prisma.payment.update({
        where: { id: providerRef },
        data: { status: 'PAID' },
      })
      return toPaymentIntent(payment)
    },
    async refund(paymentId) {
      const payment = await prisma.payment.update({
        where: { id: paymentId },
        data: { status: 'REFUNDED' },
      })
      return toPaymentIntent(payment)
    },
    async getStatus(paymentId) {
      const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })
      return toPaymentIntent(payment)
    },
    verifyWebhook() {
      return true
    },
  }
  registerPaymentProvider(provider)
  return provider
}
