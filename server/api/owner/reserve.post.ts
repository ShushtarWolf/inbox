export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event)
  const body = await readBody<{
    slotId?: string
    guestName?: string
    guestFamily?: string
    guestMobile?: string
    paymentMethod?: string
    comments?: string
    displayStatus?: string
  }>(event)
  if (!body.slotId) throw createError({ statusCode: 400, statusMessage: 'slotId required' })

  const slot = await prisma.slot.findFirst({
    where: { id: body.slotId, court: { clubId: club.id } },
    include: { booking: true },
  })
  if (!slot) throw createError({ statusCode: 404, statusMessage: 'Slot not found' })

  if (slot.booking) {
    await prisma.booking.update({
      where: { id: slot.booking.id },
      data: {
        guestName: body.guestName,
        guestFamily: body.guestFamily,
        guestMobile: body.guestMobile,
        paymentMethod: body.paymentMethod as 'IPG' | 'CASH' | 'PAID' | 'NOT_PAID' | undefined,
        comments: body.comments,
        paymentStatus: body.paymentMethod === 'PAID' ? 'PAID' : 'PAY_AT_CLUB',
      },
    })
  } else {
    await prisma.$transaction(async (tx) => {
      const createdBooking = await tx.booking.create({
        data: {
          slotId: slot.id,
          guestName: body.guestName,
          guestFamily: body.guestFamily,
          guestMobile: body.guestMobile,
          paymentMethod: body.paymentMethod as 'IPG' | 'CASH' | 'PAID' | 'NOT_PAID' | undefined,
          comments: body.comments,
          source: 'CLUB',
          status: 'CONFIRMED',
          paymentStatus: body.paymentMethod === 'PAID' ? 'PAID' : 'PAY_AT_CLUB',
        },
      })
      await tx.payment.create({
        data: {
          bookingId: createdBooking.id,
          amount: slot.price,
          method: (body.paymentMethod as 'IPG' | 'CASH' | 'PAID' | 'NOT_PAID' | undefined) || 'CASH',
          status: body.paymentMethod === 'PAID' ? 'PAID' : 'PAY_AT_CLUB',
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
