import { randomBytes } from 'node:crypto'
import type { PaymentService } from '#shared/payments.ts'
import { getPaymentsMode, PAYMENT_CURRENCY } from '#shared/payments.ts'
import { registerPaymentProvider } from '../registry'
import { toPaymentIntent } from '../registry'

/** Test-mode provider — persists payment rows without external gateway. */
export function logPaymentProvider(): PaymentService {
  const provider: PaymentService = {
    name: 'log',
    async createIntent(input) {
      const providerRef = `log-test-${randomBytes(8).toString('hex')}`
      const payment = await prisma.payment.create({
        data: {
          amount: input.amount,
          method: 'IPG',
          status: 'PENDING_ONLINE',
          provider: 'log',
          providerRef,
          idempotencyKey: input.idempotencyKey,
          bookingId: input.bookingId,
          coachSessionId: input.coachSessionId,
          packageBookingId: input.packageBookingId,
          metadataJson: JSON.stringify({ logged: true }),
        },
      })
      console.log('[payment:log]', providerRef, input.amount)
      return {
        paymentId: payment.id,
        mode: getPaymentsMode(),
        intent: {
          id: payment.id,
          amount: payment.amount,
          currency: PAYMENT_CURRENCY,
          status: 'PENDING_ONLINE',
          provider: 'log',
          providerRef,
        },
      }
    },
    async confirm(providerRef) {
      const payment = await prisma.payment.findFirst({ where: { provider: 'log', providerRef } })
        || await prisma.payment.findUnique({ where: { id: providerRef } })
      if (!payment) throw createError({ statusCode: 404, statusMessage: 'Payment not found' })
      if (payment.status === 'PAID' || payment.status === 'REFUNDED') {
        return toPaymentIntent(payment)
      }
      const updated = await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'PAID' },
      })
      return toPaymentIntent(updated)
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
