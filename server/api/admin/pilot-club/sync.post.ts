/**
 * Sync the live MVP pilot club (find by slug or دانشگاه علم و صنعت).
 * POST /api/admin/pilot-club/sync
 * Header: x-admin-secret
 * Body: { clubId?: string, slug?: string }
 */
import { syncPilotClub } from '../../../utils/behnazClubPhotos'
import { resolvePilotClub } from '../../../utils/resolvePilotClub'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const body = await readBody<{ clubId?: string; slug?: string }>(event).catch(() => ({}))
  const club = await resolvePilotClub(body)
  const result = await syncPilotClub(prisma, club.id)
  return { ok: true, previous: club, ...result }
})
