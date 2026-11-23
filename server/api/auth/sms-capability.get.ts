import { getSmsStatusSnapshot } from '#shared/sms.ts'
import { stagingPhoneLoginEnabled } from '#shared/stagingBoot.ts'

/**
 * Public, secret-free SMS capability probe for auth UI copy.
 * Never returns keys, template names, or phone allowlists.
 */
export default defineEventHandler(() => {
  const snapshot = getSmsStatusSnapshot()
  return {
    ok: true,
    smsPhase: snapshot.smsPhase,
    multiReady: snapshot.multiReady,
    resolvedProvider: snapshot.resolvedProvider,
    /** Honest label for OTP UI — live only when gateway is actually live. */
    smsMode: snapshot.resolvedProvider,
    /** Staging Liara only — instant athlete login without OTP (never on production inbox). */
    stagingPhoneLoginEnabled: stagingPhoneLoginEnabled(),
  }
})
