export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{ slotId?: string }>(event)
  if (!body.slotId) throw createError({ statusCode: 400, statusMessage: 'slotId required' })

  const slot = await prisma.slot.findUnique({
    where: { id: body.slotId },
    include: { court: { include: { club: true } }, booking: true },
  })
  const staleCancelledBooking = slot?.displayStatus === 'FREE' && slot.booking?.status === 'CANCELLED' ? slot.booking : null
  if (!slot || slot.displayStatus !== 'FREE' || (slot.booking && !staleCancelledBooking)) {
    // #region agent log
    fetch('http://127.0.0.1:7459/ingest/150d6ec9-7ea4-4890-8fdc-843d504b2806',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1a314a'},body:JSON.stringify({sessionId:'1a314a',runId:'pre-fix',hypothesisId:'A',location:'server/api/bookings/court.post.ts',message:'court booking rejected at availability gate',data:{slotId:body.slotId,slotExists:Boolean(slot),displayStatus:slot?.displayStatus ?? null,hasBooking:Boolean(slot?.booking),bookingStatus:slot?.booking?.status ?? null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    throw createError({ statusCode: 409, statusMessage: 'Slot not available' })
  }

  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
  const booking = await prisma.$transaction(async (tx) => {
    if (staleCancelledBooking) {
      // #region agent log
      fetch('http://127.0.0.1:7459/ingest/150d6ec9-7ea4-4890-8fdc-843d504b2806',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1a314a'},body:JSON.stringify({sessionId:'1a314a',runId:'post-fix',hypothesisId:'A',location:'server/api/bookings/court.post.ts',message:'removing stale cancelled booking before new court booking',data:{slotId:slot.id,staleBookingId:staleCancelledBooking.id},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      await tx.booking.delete({ where: { id: staleCancelledBooking.id } })
    }
    const b = await tx.booking.create({
      data: {
        slotId: slot.id,
        userId: user.id,
        guestName: dbUser.name,
        guestMobile: dbUser.phone,
        paymentStatus: 'PAY_AT_CLUB',
        source: 'PLATFORM',
        status: 'CONFIRMED',
      },
    })
    await tx.payment.create({
      data: {
        bookingId: b.id,
        amount: slot.price,
        method: 'CASH',
        status: 'PAY_AT_CLUB',
      },
    })
    await tx.reservationEvent.create({
      data: {
        bookingId: b.id,
        actorUserId: user.id,
        type: 'CREATED',
        metadataJson: JSON.stringify({ source: 'platform' }),
      },
    })
    await tx.slot.update({
      where: { id: slot.id },
      data: { displayStatus: 'RESERVED' },
    })
    return b
  })

  return { id: booking.id, paymentStatus: 'PAY_AT_CLUB' }
})
