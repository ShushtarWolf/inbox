import { clampWeeklyWeeks } from '#shared/weeklyOccurrences.ts'
import { previewWeeklyUnblock, weeklyAnchorsFromSlotIds } from '../../utils/blockWeekly'

/** Dry-run weekly unblock from anchor slot(s). */
export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{
    slotId?: string
    slotIds?: string[]
    weeks?: number
  }>(event)

  const ids = body.slotIds?.length
    ? body.slotIds
    : body.slotId
      ? [body.slotId]
      : []
  if (!ids.length) throw createError({ statusCode: 400, statusMessage: 'slotId required' })

  const weeks = clampWeeklyWeeks(body.weeks ?? 1)
  const anchors = await weeklyAnchorsFromSlotIds(club.id, ids)
  if (!anchors.length) throw createError({ statusCode: 404, statusMessage: 'Slot not found' })

  const result = await previewWeeklyUnblock({
    clubId: club.id,
    anchors,
    weeks,
  })

  return {
    willUnblockCount: result.willUnblockCount,
    skippedCount: result.skippedCount,
    willUnblock: result.willUnblock,
    conflicts: result.conflicts,
    weeks: result.weeks,
    anchorCount: result.anchorCount,
  }
})
