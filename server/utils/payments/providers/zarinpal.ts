import type { PaymentService } from '../service'
import { getPaymentsMode } from '#shared/payments.ts'

export const zarinpalProvider: PaymentService = {
  async createIntent() {
    if (getPaymentsMode() === 'test') {
      return {
        paymentId: 'test-payment',
        mode: 'test',
        intent: {
          id: 'test-payment',
          amount: 0,
          currency: 'IRR',
          status: 'PENDING_ONLINE',
          provider: 'zarinpal',
          redirectUrl: 'https://sandbox.zarinpal.com/pg/test',
        },
      }
    }
    throw createError({ statusCode: 501, statusMessage: 'Zarinpal not configured' })
  },
  async confirm() {
    throw createError({ statusCode: 501, statusMessage: 'Zarinpal not configured' })
  },
  async refund() {
    throw createError({ statusCode: 501, statusMessage: 'Zarinpal not configured' })
  },
  async getStatus() {
    throw createError({ statusCode: 501, statusMessage: 'Zarinpal not configured' })
  },
}
