export type SmsProviderName = 'log' | 'live'

export type SmsMode = 'log' | 'live'

export type SmsTemplate =
  | 'WAITLIST_SLOT_AVAILABLE'
  | 'PASSWORD_RESET'
  | 'BOOKING_CONFIRMED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_PAID'
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

/** Why this SMS is being sent — OTP may use Kavenegar Verify Lookup; CRM/notify never should. */
export type SmsPurpose = 'otp' | 'notify' | 'campaign'

export interface SmsProvider {
  readonly name: SmsProviderName
  send(opts: { to: string; body: string; clubId?: string; purpose?: SmsPurpose }): Promise<SmsResult>
  sendBulk(opts: {
    recipients: SmsRecipient[]
    body: string
    clubId?: string
    campaignName?: string
    segmentName?: string
  }): Promise<SmsResult>
}

export function getSmsMode(): SmsMode {
  const provider = (process.env.SMS_PROVIDER || '').toLowerCase()
  return provider === 'live' || provider === 'kavenegar' ? 'live' : 'log'
}

/**
 * Resolve SMS provider name.
 * Live (Kavenegar) only when explicitly enabled and configured; otherwise fail closed to `log`.
 */
export function resolveSmsProvider(): SmsProviderName {
  const provider = (process.env.SMS_PROVIDER || '').toLowerCase()
  const wantsLive = provider === 'live' || provider === 'kavenegar'
  if (wantsLive && process.env.SMS_ENABLED === 'true' && process.env.KAVENEGAR_API_KEY?.trim()) {
    return 'live'
  }
  return 'log'
}

export function isSmsEnabled(): boolean {
  // Dry-run/log pipeline is always available; live gateways require SMS_ENABLED + API key
  return process.env.SMS_ENABLED === 'true' || getSmsMode() === 'log'
}

/** Recipient statuses used by CRM campaign rows (never claim phone delivery unless live send succeeded). */
export const SMS_RECIPIENT_STATUS = {
  sent: 'sent',
  logged: 'logged',
  scheduled: 'scheduled',
  queued: 'queued-for-gateway',
} as const

export function recipientStatusForSmsResult(result: SmsResult): string {
  if (result.sent) return SMS_RECIPIENT_STATUS.sent
  if (result.logged) return SMS_RECIPIENT_STATUS.logged
  return SMS_RECIPIENT_STATUS.queued
}
