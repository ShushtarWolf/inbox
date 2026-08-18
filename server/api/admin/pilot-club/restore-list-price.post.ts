/**
 * Restore MVP list/court prices (not SEP test amounts).
 * POST /api/admin/pilot-club/restore-list-price
 * Header: x-admin-secret
 */
import { restorePilotListPrice } from '../../../utils/behnazClubPhotos'
import { resolvePilotClub } from '../../../utils/resolvePilotClub'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const body = await readBody<{ clubId?: string; slug?: string }>(event).catch(() => ({}))
  const club = await resolvePilotClub(body)
  const result = await restorePilotListPrice(prisma, club.id)
  return { ok: true, previous: club, ...result }
})
