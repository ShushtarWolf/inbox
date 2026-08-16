/** Desk: save/clear slot note without requiring a full reserve (guest/payment). */
export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{
    slotId?: string
    comments?: string | null
  }>(event)

  if (!body.slotId) throw createError({ statusCode: 400, statusMessage: 'slotId required' })

  const comments = typeof body.comments === 'string' ? body.comments.trim() : ''
  const commentsValue = comments || null

  const slot = await prisma.slot.findFirst({
    where: { id: body.slotId, court: { clubId: club.id } },
    include: { booking: true },
  })
  if (!slot) throw createError({ statusCode: 404, statusMessage: 'Slot not found' })

  if (slot.booking) {
    await prisma.booking.update({
      where: { id: slot.booking.id },
      data: { comments: commentsValue },
    })
    return { ok: true, slotId: slot.id, comments: commentsValue }
  }

  if (!commentsValue) {
    throw createError({ statusCode: 400, statusMessage: 'comments required for new note' })
  }

  // Free (or closed-without-booking): attach a note booking. FREE → PENDING so the
  // annotation holds the hour without a full walk-in reserve.
  const nextDisplay =
    slot.displayStatus === 'FREE'
      ? 'PENDING'
      : slot.displayStatus === 'CLOSED'
        ? 'CLOSED'
        : null

  if (!nextDisplay) {
    throw createError({ statusCode: 409, statusMessage: 'Slot cannot take a note-only booking' })
  }

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.slot.updateMany({
      where: {
        id: slot.id,
        displayStatus: slot.displayStatus,
      },
      data: { displayStatus: nextDisplay },
    })
    if (claimed.count !== 1) {
      throw createError({ statusCode: 409, statusMessage: 'Slot not available' })
    }
    await tx.booking.create({
      data: {
        slotId: slot.id,
        comments: commentsValue,
        source: 'CLUB',
        status: nextDisplay === 'PENDING' ? 'PENDING' : 'CONFIRMED',
        paymentStatus: 'PAY_AT_CLUB',
      },
    })
  })

  return { ok: true, slotId: slot.id, comments: commentsValue, displayStatus: nextDisplay }
})
