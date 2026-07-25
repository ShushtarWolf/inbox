import { resolveSmsProvider, getSmsMode, isSmsEnabled, resolveSmsPhase } from '#shared/sms.ts'

/** Safe SMS diagnostics — never returns API keys or message bodies. */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const hasKey = Boolean(process.env.KAVENEGAR_API_KEY?.trim())
  const hasTemplate = Boolean(process.env.KAVENEGAR_TEMPLATE?.trim())
  const hasSender = Boolean(process.env.KAVENEGAR_SENDER?.trim())
  const provider = resolveSmsProvider()
  const smsMode = getSmsMode()
  const smsEnabledFlag = process.env.SMS_ENABLED === 'true'
  const smsPhase = resolveSmsPhase()
  const now = new Date()

  const [pendingScheduled, dueNow] = await Promise.all([
    prisma.campaign.count({
      where: { status: 'SCHEDULED', channel: 'SMS' },
    }),
    prisma.campaign.count({
      where: {
        status: 'SCHEDULED',
        channel: 'SMS',
        scheduledAt: { lte: now },
      },
    }),
  ])

  const warnings: string[] = []
  if (smsMode === 'live' && !smsEnabledFlag) {
    warnings.push('SMS_PROVIDER wants live but SMS_ENABLED is not true — staying in log mode')
  }
  if (smsMode === 'live' && smsEnabledFlag && !hasKey) {
    warnings.push('Live mode requested but KAVENEGAR_API_KEY is missing — staying in log mode')
  }
  if (provider === 'live' && !hasTemplate && !hasSender) {
    warnings.push(
      'Live SMS with neither KAVENEGAR_TEMPLATE nor KAVENEGAR_SENDER — OTP uses sms/send and often fails with invalid sender; set a panel-approved sender or Verify Lookup template',
    )
  }
  if (provider === 'live' && !hasTemplate && hasSender) {
    warnings.push(
      'KAVENEGAR_TEMPLATE unset — OTP uses free-text sms/send (requires a valid KAVENEGAR_SENDER). Prefer a panel-approved Verify Lookup template for OTP.',
    )
  }
  if (smsPhase === 'SINGLE') {
    warnings.push(
      'SMS phase SINGLE — UI must not claim delivery to any Iranian number; trial/approved-number or log/bypass only',
    )
  }

  return {
    ok: true,
    smsPhase,
    multiReady: smsPhase === 'MULTI',
    multiReadyChecks: {
      liveProvider: provider === 'live',
      smsEnabled: smsEnabledFlag,
      hasApiKey: hasKey,
      hasTemplateOrSender: hasTemplate || hasSender,
    },
    resolvedProvider: provider,
    smsMode,
    smsEnabledFlag,
    isSmsEnabled: isSmsEnabled(),
    hasKavenegarApiKey: hasKey,
    hasKavenegarTemplate: hasTemplate,
    hasKavenegarSender: hasSender,
    pendingScheduled,
    dueNow,
    warnings,
    note:
      smsPhase === 'MULTI'
        ? 'MULTI — live Kavenegar ready (key + template/sender + SMS_ENABLED); OTP/notify may claim any valid IR mobile used in-product'
        : provider === 'live'
          ? 'SINGLE — live path partial; do not claim any-IR delivery until template/sender + key + SMS_ENABLED are all ready'
          : 'SINGLE — safe log mode; OTP returns debugCode; booking/waitlist SMS skipped (logged); no gateway calls',
  }
})
