import { normalizeGuestNamePair } from '#shared/guestName.ts'
import { clampWeeklyWeeks } from '#shared/weeklyOccurrences.ts'
import { rethrowSlotConflict } from '../../utils/prismaErrors'
import { applyBlockSlotIds, applyWeeklyBlock } from '../../utils/blockWeekly'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{
    slotId?: string
    slotIds?: string[]
    weeks?: number
    acceptSkips?: boolean
    guestName?: string
    guestFamily?: string
    guestMobile?: string
    comments?: string
  }>(event)

  const guest = normalizeGuestNamePair(body.guestName, body.guestFamily)
  const guestData = {
    guestName: guest.guestName || null,
    guestFamily: guest.guestFamily || null,
    guestMobile: body.guestMobile?.trim() || null,
    comments: body.comments?.trim() || null,
  }

  const weeks = body.weeks != null ? clampWeeklyWeeks(body.weeks) : 1
  const anchorId = String(body.slotId || body.slotIds?.[0] || '').trim()

  try {
    if (weeks > 1) {
      if (!anchorId) throw createError({ statusCode: 400, statusMessage: 'slotId required' })
      const anchor = await prisma.slot.findFirst({
        where: { id: anchorId, court: { clubId: club.id } },
        select: { courtId: true, date: true, startTime: true },
      })
      if (!anchor) throw createError({ statusCode: 404, statusMessage: 'Slot not found' })

      return await applyWeeklyBlock({
        clubId: club.id,
        courtId: anchor.courtId,
        startTime: anchor.startTime,
        anchorDate: anchor.date,
        weeks,
        acceptSkips: Boolean(body.acceptSkips),
        guestData,
      })
    }

    const ids = body.slotIds?.length ? body.slotIds : body.slotId ? [body.slotId] : []
    if (!ids.length) throw createError({ statusCode: 400, statusMessage: 'slotId required' })
    return await applyBlockSlotIds({ clubId: club.id, slotIds: ids, guestData })
  } catch (err) {
    rethrowSlotConflict(err)
  }
})
