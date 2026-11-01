import { inviteClubStaffByPhone } from '../../../utils/staffInvite'

/**
 * Invite desk/manager staff by Iranian mobile so they can OTP sign in.
 * Does not invite coaches — coaches are independent of club staff.
 */
export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'team')
  const body = await readBody<{
    phone?: string
    role?: string
    name?: string
    nameFamily?: string
    permissions?: string[]
  }>(event)

  return inviteClubStaffByPhone({
    event,
    club,
    phoneRaw: body.phone || '',
    name: body.name,
    nameFamily: body.nameFamily,
    role: body.role,
    permissions: body.permissions,
  })
})
