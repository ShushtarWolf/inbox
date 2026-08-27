import { inviteClubStaffByPhone } from '../../../utils/staffInvite'

/**
 * Invite desk/manager staff by Iranian mobile so they can OTP sign in.
 * Does not require the coach product (unlike /api/owner/coaches/invite for COACH role).
 */
export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'team')
  const body = await readBody<{
    phone?: string
    role?: string
    name?: string
    permissions?: string[]
  }>(event)

  return inviteClubStaffByPhone({
    event,
    club,
    phoneRaw: body.phone || '',
    name: body.name,
    role: body.role,
    permissions: body.permissions,
  })
})
