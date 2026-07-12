import { cancelCourtBooking } from '../../utils/cancellations'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{
    slotId?: string
    reason?: string
  }>(event)
  if (!body.slotId) throw createError({ statusCode: 400, statusMessage: 'slotId required' })

  const slot = await prisma.slot.findFirst({
    where: { id: body.slotId, court: { clubId: club.id } },
    include: { booking: { include: { payment: true } }, court: true },
  })
  if (!slot) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  if (slot.booking) {
    await cancelCourtBooking({
      bookingId: slot.booking.id,
      slotId: slot.id,
      reason: body.reason || 'owner-cancel',
      paymentId: slot.booking.payment?.id,
      userId: slot.booking.userId,
    })
  } else {
    await prisma.slot.update({
      where: { id: slot.id },
      data: { displayStatus: 'FREE' },
    })
  }

  await notifyWaitlistForFreedSlot({
    clubId: club.id,
    courtId: slot.courtId,
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
  })

  return { ok: true }
})
