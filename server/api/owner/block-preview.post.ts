import { clampWeeklyWeeks } from '#shared/weeklyOccurrences.ts'
import { previewWeeklyBlock } from '../../utils/blockWeekly'

/** Dry-run weekly block from an anchor slot (soft conflicts — never mutates). */
export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{
    slotId?: string
    weeks?: number
  }>(event)

  const slotId = String(body.slotId || '').trim()
  if (!slotId) throw createError({ statusCode: 400, statusMessage: 'slotId required' })

  const weeks = clampWeeklyWeeks(body.weeks ?? 1)
  const anchor = await prisma.slot.findFirst({
    where: { id: slotId, court: { clubId: club.id } },
    select: { id: true, courtId: true, date: true, startTime: true },
  })
  if (!anchor) throw createError({ statusCode: 404, statusMessage: 'Slot not found' })

  const result = await previewWeeklyBlock({
    clubId: club.id,
    courtId: anchor.courtId,
    startTime: anchor.startTime,
    anchorDate: anchor.date,
    weeks,
  })

  return {
    willBlockCount: result.willBlockCount,
    skippedCount: result.skippedCount,
    willBlock: result.willBlock,
    conflicts: result.conflicts,
    weeks: result.weeks,
  }
})
