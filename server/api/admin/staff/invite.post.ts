import { inviteClubStaffByPhone } from '../../../utils/staffInvite'
import { defaultPilotClubWhere, PILOT_CLUB_SLUG } from '#shared/pilotClub.ts'

/**
 * POST /api/admin/staff/invite
 * Header: x-admin-secret
 * Body: { phone, name?, role?, clubSlug?, permissions? }
 *
 * Provisions desk staff so they can OTP sign in. No extra admin acceptance —
 * club owner invite path is the product flow; this is ops backfill.
 */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)

  const body = await readBody<{
    phone?: string
    name?: string
    role?: string
    clubSlug?: string
    permissions?: string[]
  }>(event)

  const slug = body.clubSlug?.trim() || PILOT_CLUB_SLUG
  const club = await prisma.club.findFirst({
    where: slug === PILOT_CLUB_SLUG
      ? defaultPilotClubWhere()
      : { slug },
    select: { id: true, slug: true, nameFa: true, city: true, status: true },
  })
  if (!club) {
    throw createError({ statusCode: 404, statusMessage: 'Club not found' })
  }

  const result = await inviteClubStaffByPhone({
    event,
    club,
    phoneRaw: body.phone || '',
    name: body.name,
    role: body.role || 'FRONT_DESK',
    permissions: body.permissions,
  })

  return {
    ok: true,
    club: { id: club.id, slug: club.slug, nameFa: club.nameFa, status: club.status },
    ...result,
  }
})
