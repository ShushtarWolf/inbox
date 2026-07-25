export type SmsProviderName = 'log' | 'live'

export type SmsMode = 'log' | 'live'

/** Product SMS capability claim — SINGLE = trial/log/partial; MULTI = live ready for any IR mobile. */
export type SmsPhase = 'SINGLE' | 'MULTI'

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

/** Safe ops snapshot — never includes API keys, template names, or bypass MSISDNs. */
export type SmsStatusSnapshot = {
  smsPhase: SmsPhase
  multiReady: boolean
  multiReadyChecks: {
    liveProvider: boolean
    smsEnabled: boolean
    hasApiKey: boolean
    hasTemplateOrSender: boolean
  }
  resolvedProvider: SmsProviderName
  smsMode: SmsMode
  smsEnabledFlag: boolean
  isSmsEnabled: boolean
  hasKavenegarApiKey: boolean
  hasKavenegarTemplate: boolean
  hasKavenegarSender: boolean
  /** True when AUTH_OTP_BYPASS_PHONES is set — phones themselves are never returned. */
  hasOtpBypassConfigured: boolean
  warnings: string[]
  /** Actionable Kavenegar acceptance steps when still SINGLE. */
  nextActions: string[]
  note: string
}

export function getSmsMode(): SmsMode {
  const provider = (process.env.SMS_PROVIDER || '').toLowerCase()
  return provider === 'live' || provider === 'kavenegar' ? 'live' : 'log'
}

/**
 * Resolve SMS provider name.
 * Live (Kavenegar) only when explicitly enabled and configured; otherwise fail closed to `log`.
 * For OTP in non-production: if live is requested but neither TEMPLATE nor SENDER is set,
 * stay on `log` so localhost auth works without a Kavenegar line.
 */
export function resolveSmsProvider(): SmsProviderName {
  const provider = (process.env.SMS_PROVIDER || '').toLowerCase()
  const wantsLive = provider === 'live' || provider === 'kavenegar'
  const apiKey = process.env.KAVENEGAR_API_KEY?.trim()
  if (!(wantsLive && process.env.SMS_ENABLED === 'true' && apiKey)) {
    return 'log'
  }
  const hasTemplate = Boolean(process.env.KAVENEGAR_TEMPLATE?.trim())
  const hasSender = Boolean(process.env.KAVENEGAR_SENDER?.trim())
  if (!hasTemplate && !hasSender && process.env.NODE_ENV !== 'production') {
    return 'log'
  }
  return 'live'
}

export function isSmsEnabled(): boolean {
  // Dry-run/log pipeline is always available; live gateways require SMS_ENABLED + API key
  return process.env.SMS_ENABLED === 'true' || getSmsMode() === 'log'
}

/**
 * SINGLE: log mode, missing live gate, or live without template/sender — do not claim any-IR delivery.
 * MULTI: live Kavenegar with key + SMS_ENABLED + (template or sender) — may claim OTP to any valid IR mobile.
 */
export function resolveSmsPhase(): SmsPhase {
  const provider = resolveSmsProvider()
  const hasKey = Boolean(process.env.KAVENEGAR_API_KEY?.trim())
  const hasTemplate = Boolean(process.env.KAVENEGAR_TEMPLATE?.trim())
  const hasSender = Boolean(process.env.KAVENEGAR_SENDER?.trim())
  const enabled = process.env.SMS_ENABLED === 'true'
  if (provider === 'live' && enabled && hasKey && (hasTemplate || hasSender)) {
    return 'MULTI'
  }
  return 'SINGLE'
}

/** Single source of truth for admin/owner/auth/CLI SMS capability claims. */
export function getSmsStatusSnapshot(): SmsStatusSnapshot {
  const provider = resolveSmsProvider()
  const smsMode = getSmsMode()
  const smsPhase = resolveSmsPhase()
  const hasKey = Boolean(process.env.KAVENEGAR_API_KEY?.trim())
  const hasTemplate = Boolean(process.env.KAVENEGAR_TEMPLATE?.trim())
  const hasSender = Boolean(process.env.KAVENEGAR_SENDER?.trim())
  const smsEnabledFlag = process.env.SMS_ENABLED === 'true'
  const hasOtpBypassConfigured = Boolean(process.env.AUTH_OTP_BYPASS_PHONES?.trim())
  const multiReady = smsPhase === 'MULTI'
  const multiReadyChecks = {
    liveProvider: provider === 'live',
    smsEnabled: smsEnabledFlag,
    hasApiKey: hasKey,
    hasTemplateOrSender: hasTemplate || hasSender,
  }

  const warnings: string[] = []
  const nextActions: string[] = []

  if (smsMode === 'live' && !smsEnabledFlag) {
    warnings.push('SMS_PROVIDER wants live but SMS_ENABLED is not true — staying in log mode')
    nextActions.push('Set SMS_ENABLED=true after Kavenegar panel accepts outbound SMS')
  }
  if (smsMode === 'live' && smsEnabledFlag && !hasKey) {
    warnings.push('Live mode requested but KAVENEGAR_API_KEY is missing — staying in log mode')
    nextActions.push('Set KAVENEGAR_API_KEY from the Kavenegar console')
  }
  if (provider === 'live' && !hasTemplate && !hasSender) {
    warnings.push(
      'Live SMS with neither KAVENEGAR_TEMPLATE nor KAVENEGAR_SENDER — OTP uses sms/send and often fails with invalid sender; set a panel-approved sender or Verify Lookup template',
    )
    nextActions.push('Set KAVENEGAR_TEMPLATE (preferred for OTP) or KAVENEGAR_SENDER after panel approval')
  }
  if (provider === 'live' && !hasTemplate && hasSender) {
    warnings.push(
      'KAVENEGAR_TEMPLATE unset — OTP uses free-text sms/send (requires a valid KAVENEGAR_SENDER). Prefer a panel-approved Verify Lookup template for OTP.',
    )
    nextActions.push('Prefer KAVENEGAR_TEMPLATE (Verify Lookup) for OTP reliability')
  }
  if (smsPhase === 'SINGLE') {
    warnings.push(
      'SMS phase SINGLE — UI must not claim delivery to any Iranian number; trial/approved-number or log/bypass only',
    )
    if (!smsEnabledFlag) nextActions.push('Enable SMS_ENABLED=true when Kavenegar accepts multi-number send')
    if (!hasKey) nextActions.push('Add KAVENEGAR_API_KEY')
    if (!hasTemplate && !hasSender) nextActions.push('Add KAVENEGAR_TEMPLATE or KAVENEGAR_SENDER after panel opens')
    if (smsMode !== 'live') nextActions.push('Set SMS_PROVIDER=live (or kavenegar) for production gateway')
  }
  if (hasOtpBypassConfigured) {
    warnings.push(
      'AUTH_OTP_BYPASS_PHONES is configured — listed numbers skip SMS OTP (dev/bypass only; never claim as normal MULTI delivery)',
    )
  }

  const note = multiReady
    ? 'MULTI — live Kavenegar ready (key + template/sender + SMS_ENABLED); OTP/notify may claim any valid IR mobile used in-product'
    : provider === 'live'
      ? 'SINGLE — live path partial; do not claim any-IR delivery until template/sender + key + SMS_ENABLED are all ready'
      : 'SINGLE — safe log mode; OTP returns debugCode; booking/waitlist SMS skipped (logged); no gateway calls'

  return {
    smsPhase,
    multiReady,
    multiReadyChecks,
    resolvedProvider: provider,
    smsMode,
    smsEnabledFlag,
    isSmsEnabled: isSmsEnabled(),
    hasKavenegarApiKey: hasKey,
    hasKavenegarTemplate: hasTemplate,
    hasKavenegarSender: hasSender,
    hasOtpBypassConfigured,
    warnings,
    nextActions: [...new Set(nextActions)],
    note,
  }
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
