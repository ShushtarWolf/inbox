import { canManageReservation } from '../../../utils/reservations'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  const booking = await prisma.booking.findFirst({
    where: { id, userId: user.id },
    include: { slot: { include: { court: { include: { club: true } } } } },
  })
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (booking.status === 'CANCELLED') return { ok: true }
  if (!canManageReservation(booking.slot.date, booking.slot.startTime, booking.slot.court.club.cancellationWindowHours)) {
    throw createError({ statusCode: 409, statusMessage: 'Cancellation window has passed' })
  }

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date() } })
    await tx.slot.update({ where: { id: booking.slotId }, data: { displayStatus: 'FREE' } })
    await tx.reservationEvent.create({
      data: {
        bookingId: id,
        actorUserId: user.id,
        type: 'CANCELLED',
        metadataJson: JSON.stringify({ reason: 'athlete-cancel' }),
      },
    })
  })

  await notifyWaitlistForFreedSlot({
    clubId: booking.slot.court.clubId,
    courtId: booking.slot.courtId,
    date: booking.slot.date,
    startTime: booking.slot.startTime,
    endTime: booking.slot.endTime,
  })

  return { ok: true }
})
