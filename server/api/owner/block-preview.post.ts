import { clampWeeklyWeeks } from '#shared/weeklyOccurrences.ts'
import { previewWeeklyBlock, weeklyAnchorsFromSlotIds } from '../../utils/blockWeekly'

/** Dry-run weekly block from anchor slot(s) (soft conflicts — never mutates). */
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

  const result = await previewWeeklyBlock({
    clubId: club.id,
    anchors,
    weeks,
  })

  return {
    willBlockCount: result.willBlockCount,
    skippedCount: result.skippedCount,
    willBlock: result.willBlock,
    conflicts: result.conflicts,
    weeks: result.weeks,
    anchorCount: result.anchorCount,
  }
})
