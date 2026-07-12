import type { PaymentIntent, PaymentProvider, PaymentService } from '#shared/payments.ts'
import { PAYMENT_CURRENCY } from '#shared/payments.ts'

export function toPaymentIntent(payment: {
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

const registry = new Map<PaymentProvider, PaymentService>()

export function registerPaymentProvider(provider: PaymentService) {
  registry.set(provider.name, provider)
}

export function getRegisteredPaymentProvider(name: PaymentProvider): PaymentService | undefined {
  return registry.get(name)
}

export function listPaymentProviders(): PaymentProvider[] {
  return [...registry.keys()]
}
