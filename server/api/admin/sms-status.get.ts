import { resolveSmsProvider, getSmsMode, isSmsEnabled } from '#shared/sms.ts'

/** Safe SMS diagnostics — never returns API keys or message bodies. */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const hasKey = Boolean(process.env.KAVENEGAR_API_KEY?.trim())
  const provider = resolveSmsProvider()
  return {
    ok: true,
    resolvedProvider: provider,
    smsMode: getSmsMode(),
    smsEnabledFlag: process.env.SMS_ENABLED === 'true',
    isSmsEnabled: isSmsEnabled(),
    hasKavenegarApiKey: hasKey,
    hasKavenegarTemplate: Boolean(process.env.KAVENEGAR_TEMPLATE?.trim()),
    hasKavenegarSender: Boolean(process.env.KAVENEGAR_SENDER?.trim()),
    note:
      provider === 'live'
        ? 'Live Kavenegar — OTP will not return debugCode; real SMS sends'
        : 'Safe log mode — OTP returns debugCode; no gateway calls',
  }
})
