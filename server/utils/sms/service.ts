import type { SmsProvider } from '#shared/sms.ts'
import { resolveSmsProvider } from '#shared/sms.ts'
import { getRegisteredSmsProvider } from './registry'
import { logSmsProvider } from './providers/log'
import { kavenegarSmsProvider } from './providers/kavenegar'

let bootstrapped = false

function bootstrapProviders() {
  if (bootstrapped) return
  logSmsProvider()
  kavenegarSmsProvider()
  bootstrapped = true
}

export function getSmsService(): SmsProvider {
  bootstrapProviders()
  const name = resolveSmsProvider()
  const service = getRegisteredSmsProvider(name)
  if (!service) {
    throw createError({ statusCode: 500, statusMessage: `SMS provider not registered: ${name}` })
  }
  return service
}

export async function sendSms(opts: { to: string; body: string; clubId?: string }) {
  return getSmsService().send(opts)
}

export async function sendBulkSms(opts: {
  recipients: Array<{ phone: string; name?: string; contactId?: string }>
  body: string
  clubId?: string
  campaignName?: string
  segmentName?: string
}) {
  return getSmsService().sendBulk(opts)
}
