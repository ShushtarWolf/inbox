import { resolveSmsProvider, getSmsMode, isSmsEnabled } from '#shared/sms.ts'

/** Safe SMS diagnostics — never returns API keys or message bodies. */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const hasKey = Boolean(process.env.KAVENEGAR_API_KEY?.trim())
  const provider = resolveSmsProvider()
  const smsMode = getSmsMode()
  const smsEnabledFlag = process.env.SMS_ENABLED === 'true'
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

  return {
    ok: true,
    resolvedProvider: provider,
    smsMode,
    smsEnabledFlag,
    isSmsEnabled: isSmsEnabled(),
    hasKavenegarApiKey: hasKey,
    hasKavenegarTemplate: Boolean(process.env.KAVENEGAR_TEMPLATE?.trim()),
    hasKavenegarSender: Boolean(process.env.KAVENEGAR_SENDER?.trim()),
    pendingScheduled,
    dueNow,
    warnings,
    note:
      provider === 'live'
        ? 'Live Kavenegar — OTP will not return debugCode; real SMS sends'
        : 'Safe log mode — OTP returns debugCode; no gateway calls',
  }
})
