import { randomBytes } from 'node:crypto'
import type { PaymentService } from '#shared/payments.ts'
import { getPaymentsMode, PAYMENT_CURRENCY } from '#shared/payments.ts'
import { registerPaymentProvider } from '../registry'
import { toPaymentIntent } from '../registry'

export function zarinpalProvider(): PaymentService {
  const provider: PaymentService = {
    name: 'zarinpal',
    async createIntent(input) {
      const mode = getPaymentsMode()
      if (mode === 'live') {
        const merchantId = process.env.ZARINPAL_MERCHANT_ID
        if (!merchantId) {
          throw createError({ statusCode: 501, statusMessage: 'Zarinpal not configured' })
        }
        throw createError({ statusCode: 501, statusMessage: 'Zarinpal live not implemented' })
      }

      const providerRef = `zarinpal-test-${randomBytes(8).toString('hex')}`
      const payment = await prisma.payment.create({
        data: {
          amount: input.amount,
          method: 'IPG',
          status: 'PENDING_ONLINE',
          provider: 'zarinpal',
          providerRef,
          idempotencyKey: input.idempotencyKey,
          bookingId: input.bookingId,
          coachSessionId: input.coachSessionId,
          packageBookingId: input.packageBookingId,
        },
      })
      return {
        paymentId: payment.id,
        mode: 'test',
        intent: {
          id: payment.id,
          amount: payment.amount,
          currency: PAYMENT_CURRENCY,
          status: 'PENDING_ONLINE',
          provider: 'zarinpal',
          providerRef,
          redirectUrl: `https://sandbox.zarinpal.com/pg/test/${providerRef}`,
        },
      }
    },
    async confirm(providerRef) {
      const mode = getPaymentsMode()
      if (mode === 'live') {
        // Fail closed: never fake PAID success in live without a real IPG verify
        throw createError({ statusCode: 501, statusMessage: 'Zarinpal live confirm not implemented' })
      }
      const payment = await prisma.payment.findFirst({ where: { provider: 'zarinpal', providerRef } })
      if (!payment) throw createError({ statusCode: 404, statusMessage: 'Payment not found' })
      const updated = await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'PAID' },
      })
      return toPaymentIntent(updated)
    },
    async refund(paymentId) {
      const mode = getPaymentsMode()
      if (mode === 'live') {
        throw createError({ statusCode: 501, statusMessage: 'Zarinpal live refund not implemented' })
      }
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
    verifyWebhook(payload: unknown) {
      return Boolean(payload && typeof payload === 'object')
    },
  }
  registerPaymentProvider(provider)
  return provider
}
