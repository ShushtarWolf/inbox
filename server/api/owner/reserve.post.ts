export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event)
  const body = await readBody<{
    slotId?: string
    guestName?: string
    guestFamily?: string
    guestMobile?: string
    paymentMethod?: string
    paymentStatus?: string
    comments?: string
    displayStatus?: string
  }>(event)
  if (!body.slotId) throw createError({ statusCode: 400, statusMessage: 'slotId required' })

  const slot = await prisma.slot.findFirst({
    where: { id: body.slotId, court: { clubId: club.id } },
    include: { booking: true },
  })
  if (!slot) throw createError({ statusCode: 404, statusMessage: 'Slot not found' })

  const paymentMethod = (body.paymentMethod as 'IPG' | 'CASH' | undefined) || 'CASH'
  const paymentStatus = body.paymentStatus === 'PAID' ? 'PAID' : 'PAY_AT_CLUB'

  if (slot.booking) {
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: slot.booking.id },
        data: {
          guestName: body.guestName,
          guestFamily: body.guestFamily,
          guestMobile: body.guestMobile,
          paymentMethod,
          comments: body.comments,
          paymentStatus,
          status: 'CONFIRMED',
        },
      })
      await tx.payment.upsert({
        where: { bookingId: slot.booking.id },
        update: {
          amount: slot.price,
          method: paymentMethod,
          status: paymentStatus,
        },
        create: {
          bookingId: slot.booking.id,
          amount: slot.price,
          method: paymentMethod,
          status: paymentStatus,
        },
      })
      await tx.slot.update({
        where: { id: slot.id },
        data: { displayStatus: (body.displayStatus as 'RESERVED') || 'RESERVED' },
      })
    })
  } else {
    await prisma.$transaction(async (tx) => {
      const createdBooking = await tx.booking.create({
        data: {
          slotId: slot.id,
          guestName: body.guestName,
          guestFamily: body.guestFamily,
          guestMobile: body.guestMobile,
          paymentMethod,
          comments: body.comments,
          source: 'CLUB',
          status: 'CONFIRMED',
          paymentStatus,
        },
      })
      await tx.payment.create({
        data: {
          bookingId: createdBooking.id,
          amount: slot.price,
          method: paymentMethod,
          status: paymentStatus,
        },
      })
      await tx.reservationEvent.create({
        data: {
          bookingId: createdBooking.id,
          type: 'CREATED',
          metadataJson: JSON.stringify({ source: 'owner-calendar' }),
        },
      })
      await tx.slot.update({
        where: { id: slot.id },
        data: { displayStatus: (body.displayStatus as 'RESERVED') || 'RESERVED' },
      })
    })
  }
  return { ok: true }
})
