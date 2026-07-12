export type SmsProviderName = 'log'

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

export function resolveSmsProvider(): SmsProviderName {
  const configured = process.env.SMS_PROVIDER as SmsProviderName | undefined
  if (configured === 'log') return 'log'
  return 'log'
}

export function isSmsEnabled(): boolean {
  return process.env.SMS_ENABLED === 'true' || getSmsMode() === 'log'
}
