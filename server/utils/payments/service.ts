import type { PaymentService } from '#shared/payments.ts'
import { resolvePaymentProvider } from '#shared/payments.ts'
import { getRegisteredPaymentProvider } from './registry'
import { logPaymentProvider } from './providers/log'
import { payAtClubProvider } from './providers/pay_at_club'
import { zarinpalProvider } from './providers/zarinpal'

let bootstrapped = false

function bootstrapProviders() {
  if (bootstrapped) return
  payAtClubProvider()
  zarinpalProvider()
  logPaymentProvider()
  bootstrapped = true
}

export function getPaymentService(provider?: string): PaymentService {
  bootstrapProviders()
  const name = resolvePaymentProvider(provider)
  const service = getRegisteredPaymentProvider(name)
  if (!service) {
    throw createError({ statusCode: 500, statusMessage: `Payment provider not registered: ${name}` })
  }
  return service
}
