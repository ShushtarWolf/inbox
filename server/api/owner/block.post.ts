import { cancelCourtBooking } from '../../utils/cancellations'

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

  const guestData = {
    guestName: body.guestName?.trim() || null,
    guestFamily: body.guestFamily?.trim() || null,
    guestMobile: body.guestMobile?.trim() || null,
    comments: body.comments?.trim() || null,
  }

  for (const slotId of ids) {
    const slot = await prisma.slot.findFirst({
      where: { id: slotId, court: { clubId: club.id } },
      include: { booking: true },
    })
    if (!slot) throw createError({ statusCode: 404, statusMessage: 'Slot not found' })

    if (slot.displayStatus !== 'FREE' && slot.displayStatus !== 'BLOCKED') {
      throw createError({ statusCode: 409, statusMessage: 'SLOT_NOT_BLOCKABLE' })
    }

    if (slot.booking) {
      await prisma.$transaction(async (tx) => {
        await tx.booking.update({
          where: { id: slot.booking!.id },
          data: guestData,
        })
        await tx.slot.update({
          where: { id: slot.id },
          data: { displayStatus: 'BLOCKED' },
        })
      })
    } else {
      await prisma.$transaction(async (tx) => {
        await tx.booking.create({
          data: {
            slotId: slot.id,
            ...guestData,
            source: 'CLUB',
            status: 'CONFIRMED',
            paymentStatus: 'PAY_AT_CLUB',
          },
        })
        await tx.slot.update({
          where: { id: slot.id },
          data: { displayStatus: 'BLOCKED' },
        })
      })
    }
  }

  return { ok: true, count: ids.length }
})
