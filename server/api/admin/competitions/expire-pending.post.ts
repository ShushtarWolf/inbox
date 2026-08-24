import { expireStalePendingEntries } from '../../../utils/competitions'

/** Cancel PENDING competition entries whose payment never settled (releases seats). */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const result = await expireStalePendingEntries()
  return { ok: true, ...result }
})
