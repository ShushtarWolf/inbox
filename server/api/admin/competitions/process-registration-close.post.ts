import {
  expireStalePendingEntries,
  processCompetitionsPastRegistrationClose,
} from '../../../utils/competitions'

/** Cron: expire stale PENDING entries + close registration + auto-cancel below minParticipants. */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const [expired, registration] = await Promise.all([
    expireStalePendingEntries(),
    processCompetitionsPastRegistrationClose(),
  ])
  return { ok: true, ...expired, ...registration }
})
