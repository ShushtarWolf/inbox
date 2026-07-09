export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event)
  const body = await readBody<{
    slotId?: string
    reason?: string
  }>(event)
  if (!body.slotId) throw createError({ statusCode: 400, statusMessage: 'slotId required' })

  const slot = await prisma.slot.findFirst({
    where: { id: body.slotId, court: { clubId: club.id } },
    include: { booking: true },
  })
  if (!slot) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  await prisma.$transaction(async (tx) => {
    if (slot.booking) {
      await tx.booking.update({
        where: { id: slot.booking.id },
        data: { status: 'CANCELLED', comments: body.reason, cancelledAt: new Date() },
      })
      await tx.reservationEvent.create({
        data: {
          bookingId: slot.booking.id,
          type: 'CANCELLED',
          metadataJson: JSON.stringify({ reason: body.reason || 'owner-cancel' }),
        },
      })
    }
    await tx.slot.update({
      where: { id: slot.id },
      data: { displayStatus: 'FREE' },
    })
  })
  return { ok: true }
})
