import { rethrowSlotConflict, SlotNotAvailableError } from '../../utils/prismaErrors'
import { normalizeGuestNamePair } from '#shared/guestName.ts'
import { activeSlotBooking } from '../../utils/reservations'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{
    slotId?: string
    slotIds?: string[]
    guestName?: string
    guestFamily?: string
    guestMobile?: string
    comments?: string
  }>(event)

  const ids = body.slotIds?.length ? body.slotIds : body.slotId ? [body.slotId] : []
  if (!ids.length) throw createError({ statusCode: 400, statusMessage: 'slotId required' })

  const guest = normalizeGuestNamePair(body.guestName, body.guestFamily)
  const guestData = {
    guestName: guest.guestName || null,
    guestFamily: guest.guestFamily || null,
    guestMobile: body.guestMobile?.trim() || null,
    comments: body.comments?.trim() || null,
  }

  try {
    for (const slotId of ids) {
      const slot = await prisma.slot.findFirst({
        where: { id: slotId, court: { clubId: club.id } },
        include: { booking: true },
      })
      if (!slot) throw createError({ statusCode: 404, statusMessage: 'Slot not found' })

      if (slot.displayStatus !== 'FREE' && slot.displayStatus !== 'BLOCKED') {
        throw createError({ statusCode: 409, statusMessage: 'SLOT_NOT_BLOCKABLE' })
      }

      const existing = activeSlotBooking(slot.booking)
      const staleCancelled = slot.booking?.status === 'CANCELLED' ? slot.booking : null

      if (existing) {
        if (existing.source !== 'CLUB') {
          throw createError({ statusCode: 409, statusMessage: 'SLOT_NOT_BLOCKABLE' })
        }
        await prisma.$transaction(async (tx) => {
          await tx.booking.update({
            where: { id: existing.id },
            data: guestData,
          })
          await tx.slot.update({
            where: { id: slot.id },
            data: { displayStatus: 'BLOCKED' },
          })
        })
      } else {
        await prisma.$transaction(async (tx) => {
          if (staleCancelled) {
            await tx.booking.delete({ where: { id: staleCancelled.id } })
          }
          // Claim FREE atomically so a concurrent athlete book cannot both win.
          const claimed = await tx.slot.updateMany({
            where: { id: slot.id, displayStatus: 'FREE' },
            data: { displayStatus: 'BLOCKED' },
          })
          if (claimed.count !== 1) {
            throw new SlotNotAvailableError()
          }
          await tx.booking.create({
            data: {
              slotId: slot.id,
              ...guestData,
              source: 'CLUB',
              status: 'CONFIRMED',
              paymentStatus: 'PAY_AT_CLUB',
            },
          })
        })
      }
    }
  } catch (err) {
    rethrowSlotConflict(err)
  }

  return { ok: true, count: ids.length }
})
