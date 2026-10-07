import { listTransferCoachesForClub } from '../../utils/transferCoaches'

/**
 * Coaches affiliated with the active club for internal wallet transfers only.
 * Calendar/package pickers keep using /api/owner/coaches (all approved).
 */
export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'finance:payouts')
  if (!coachProductEnabled(event)) return []

  return listTransferCoachesForClub(club.id)
})
