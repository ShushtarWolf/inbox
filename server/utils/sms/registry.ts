import type { SmsProvider, SmsProviderName } from '#shared/sms.ts'

const registry = new Map<SmsProviderName, SmsProvider>()

export function registerSmsProvider(provider: SmsProvider) {
  registry.set(provider.name, provider)
}

export function getRegisteredSmsProvider(name: SmsProviderName): SmsProvider | undefined {
  return registry.get(name)
}
