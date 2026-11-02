import { normalizeGuestNamePair } from '#shared/guestName.ts'
import { applySeasonBlock } from '../../utils/blockSeason'
import { rethrowSlotConflict } from '../../utils/prismaErrors'
import { resolveSeasonSessionsFromBody } from '../../utils/seasonRequestSessions'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{
    acceptSkips?: boolean
    guestName?: string
    guestFamily?: string
    guestMobile?: string
    comments?: string
  } & Record<string, unknown>>(event)

  const guest = normalizeGuestNamePair(body.guestName, body.guestFamily)
  const guestData = {
    guestName: guest.guestName || null,
    guestFamily: guest.guestFamily || null,
    guestMobile: body.guestMobile?.trim() || null,
    comments: body.comments?.trim() || null,
  }

  try {
    const sessions = await resolveSeasonSessionsFromBody(club.id, body)
    return await applySeasonBlock({
      clubId: club.id,
      sessions,
      acceptSkips: Boolean(body.acceptSkips),
      guestData,
    })
  } catch (err) {
    rethrowSlotConflict(err)
  }
})
