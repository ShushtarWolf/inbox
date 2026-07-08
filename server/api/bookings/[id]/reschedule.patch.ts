import { canManageReservation } from '../../../utils/reservations'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody<{ slotId?: string }>(event)
  if (!body.slotId) throw createError({ statusCode: 400, statusMessage: 'slotId required' })

  const booking = await prisma.booking.findFirst({
    where: { id, userId: user.id },
    include: { slot: { include: { court: { include: { club: true } } } } },
  })
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Booking not found' })
  if (!canManageReservation(booking.slot.date, booking.slot.startTime, booking.slot.court.club.rescheduleWindowHours)) {
    throw createError({ statusCode: 409, statusMessage: 'Reschedule window has passed' })
  }

  const targetSlot = await prisma.slot.findUnique({
    where: { id: body.slotId },
    include: { booking: true, court: { include: { club: true } } },
  })
  const staleCancelledBooking = targetSlot?.displayStatus === 'FREE' && targetSlot.booking?.status === 'CANCELLED' ? targetSlot.booking : null
  if (!targetSlot || targetSlot.displayStatus !== 'FREE' || (targetSlot.booking && !staleCancelledBooking)) {
    // #region agent log
    fetch('http://127.0.0.1:7459/ingest/150d6ec9-7ea4-4890-8fdc-843d504b2806',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1a314a'},body:JSON.stringify({sessionId:'1a314a',runId:'pre-fix',hypothesisId:'B',location:'server/api/bookings/[id]/reschedule.patch.ts',message:'booking reschedule rejected at target slot gate',data:{bookingId:id,targetSlotId:body.slotId,targetSlotExists:Boolean(targetSlot),displayStatus:targetSlot?.displayStatus ?? null,hasBooking:Boolean(targetSlot?.booking),bookingStatus:targetSlot?.booking?.status ?? null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    throw createError({ statusCode: 409, statusMessage: 'Target slot is not available' })
  }
  if (targetSlot.court.club.id !== booking.slot.court.club.id) {
    throw createError({ statusCode: 409, statusMessage: 'Target slot must belong to the same club' })
  }

  await prisma.$transaction(async (tx) => {
    if (staleCancelledBooking) {
      // #region agent log
      fetch('http://127.0.0.1:7459/ingest/150d6ec9-7ea4-4890-8fdc-843d504b2806',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1a314a'},body:JSON.stringify({sessionId:'1a314a',runId:'post-fix',hypothesisId:'B',location:'server/api/bookings/[id]/reschedule.patch.ts',message:'removing stale cancelled booking before reschedule',data:{bookingId:id,targetSlotId:targetSlot.id,staleBookingId:staleCancelledBooking.id},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      await tx.booking.delete({ where: { id: staleCancelledBooking.id } })
    }
    await tx.slot.update({ where: { id: booking.slotId }, data: { displayStatus: 'FREE' } })
    await tx.slot.update({ where: { id: targetSlot.id }, data: { displayStatus: 'RESERVED' } })
    await tx.booking.update({
      where: { id },
      data: {
        slotId: targetSlot.id,
      },
    })
    await tx.reservationEvent.create({
      data: {
        bookingId: id,
        actorUserId: user.id,
        type: 'RESCHEDULED',
        metadataJson: JSON.stringify({ fromSlotId: booking.slotId, toSlotId: targetSlot.id }),
      },
    })
  })

  return { ok: true }
})
