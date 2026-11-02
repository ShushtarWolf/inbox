import { clampWeeklyWeeks } from '#shared/weeklyOccurrences.ts'
import { applyUnblockSlotIds, applyWeeklyUnblock, weeklyAnchorsFromSlotIds } from '../../utils/blockWeekly'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{
    slotId?: string
    slotIds?: string[]
    weeks?: number
    acceptSkips?: boolean
  }>(event)

  const weeks = body.weeks != null ? clampWeeklyWeeks(body.weeks) : 1
  const ids = body.slotIds?.length
    ? body.slotIds
    : body.slotId
      ? [body.slotId]
      : []
  if (!ids.length) throw createError({ statusCode: 400, statusMessage: 'slotId required' })

  if (weeks > 1) {
    const anchors = await weeklyAnchorsFromSlotIds(club.id, ids)
    if (!anchors.length) throw createError({ statusCode: 404, statusMessage: 'Slot not found' })
    return await applyWeeklyUnblock({
      clubId: club.id,
      anchors,
      weeks,
      acceptSkips: Boolean(body.acceptSkips),
    })
  }

  return await applyUnblockSlotIds({ clubId: club.id, slotIds: ids })
})
