import { cancelCourtBooking } from '../../utils/cancellations'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{
    slotId?: string
    slotIds?: string[]
  }>(event)

  const ids = body.slotIds?.length ? body.slotIds : body.slotId ? [body.slotId] : []
  if (!ids.length) throw createError({ statusCode: 400, statusMessage: 'slotId required' })

  for (const slotId of ids) {
    const slot = await prisma.slot.findFirst({
      where: { id: slotId, court: { clubId: club.id }, displayStatus: 'BLOCKED' },
      include: { booking: { include: { payment: true } } },
    })
    if (!slot) throw createError({ statusCode: 404, statusMessage: 'Blocked slot not found' })

    if (slot.booking) {
      await cancelCourtBooking({
        bookingId: slot.booking.id,
        slotId: slot.id,
        reason: 'owner-unblock',
        paymentId: slot.booking.payment?.id,
        userId: slot.booking.userId,
      })
    } else {
      await prisma.slot.update({
        where: { id: slot.id },
        data: { displayStatus: 'FREE' },
      })
    }
  }

  return { ok: true, count: ids.length }
})
