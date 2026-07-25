import { resolveSmsProvider, resolveSmsPhase } from '#shared/sms.ts'

/**
 * Public, secret-free SMS capability probe for auth UI copy.
 * Never returns keys, template names, or phone allowlists.
 */
export default defineEventHandler(() => {
  const resolvedProvider = resolveSmsProvider()
  const smsPhase = resolveSmsPhase()
  return {
    ok: true,
    smsPhase,
    resolvedProvider,
    /** Honest label for OTP UI — live only when gateway is actually live. */
    smsMode: resolvedProvider,
  }
})
