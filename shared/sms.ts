export type SmsProviderName = 'log' | 'live'

export type SmsMode = 'log' | 'live'

export type SmsTemplate =
  | 'WAITLIST_SLOT_AVAILABLE'
  | 'PASSWORD_RESET'
  | 'BOOKING_CONFIRMED'
  | 'CLUB_APPROVED'
  | 'CAMPAIGN'

export interface SmsResult {
  sent: boolean
  logged: boolean
  providerRef?: string
}

export interface SmsRecipient {
  phone: string
  name?: string
  contactId?: string
}

export interface SmsProvider {
  readonly name: SmsProviderName
  send(opts: { to: string; body: string; clubId?: string }): Promise<SmsResult>
  sendBulk(opts: {
    recipients: SmsRecipient[]
    body: string
    clubId?: string
    campaignName?: string
    segmentName?: string
  }): Promise<SmsResult>
}

export function getSmsMode(): SmsMode {
  return process.env.SMS_PROVIDER === 'live' ? 'live' : 'log'
}

/**
 * Resolve SMS provider name.
 * Live gateway is not registered in this phase — always fall back to `log`
 * (fail closed / dry-run) until a live adapter is plugged in behind the registry.
 */
export function resolveSmsProvider(): SmsProviderName {
  // Keep structured pipe ready; no live adapter yet → always log
  return 'log'
}

export function isSmsEnabled(): boolean {
  // Dry-run/log pipeline is always available; live gateways still require SMS_ENABLED + adapter
  return process.env.SMS_ENABLED === 'true' || getSmsMode() === 'log'
}

/** Recipient statuses used by CRM campaign rows (never claim real phone delivery). */
export const SMS_RECIPIENT_STATUS = {
  logged: 'logged',
  scheduled: 'scheduled',
  queued: 'queued-for-gateway',
} as const
