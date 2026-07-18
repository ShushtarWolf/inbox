import { resolveSmsProvider, getSmsMode } from '#shared/sms.ts'

/** Owner-safe SMS mode — no API keys, templates, or message bodies. */
export default defineEventHandler(async (event) => {
  // Mode is club-wide infra (no PII); any active club admin may read it.
  await requireOwnerClub(event)
  const provider = resolveSmsProvider()
  return {
    ok: true,
    resolvedProvider: provider,
    smsMode: getSmsMode(),
    live: provider === 'live',
  }
})
