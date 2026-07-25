import { getSmsStatusSnapshot } from '#shared/sms.ts'

/** Owner-safe SMS mode — no API keys, templates, or message bodies. */
export default defineEventHandler(async (event) => {
  // Mode is club-wide infra (no PII); any active club admin may read it.
  await requireOwnerClub(event)
  const snapshot = getSmsStatusSnapshot()
  return {
    ok: true,
    smsPhase: snapshot.smsPhase,
    multiReady: snapshot.multiReady,
    resolvedProvider: snapshot.resolvedProvider,
    smsMode: snapshot.smsMode,
    /** Prefer multiReady for claims; kept for older clients. */
    live: snapshot.multiReady,
  }
})
