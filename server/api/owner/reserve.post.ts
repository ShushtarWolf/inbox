import {
  calculateSessionTotal,
  loadEquipmentForBooking,
  syncBookingEquipments,
} from '../../utils/bookingTotal'
import { assertSlotBookable } from '../../utils/reservations'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{
    slotId?: string
    guestName?: string
    guestFamily?: string
    guestMobile?: string
    paymentMethod?: string
    paymentStatus?: string
    comments?: string
    displayStatus?: string
    equipmentIds?: string[]
  }>(event)
  if (!body.slotId) throw createError({ statusCode: 400, statusMessage: 'slotId required' })

  const slot = await prisma.slot.findFirst({
    where: { id: body.slotId, court: { clubId: club.id } },
    include: { booking: true },
  })
  if (!slot) throw createError({ statusCode: 404, statusMessage: 'Slot not found' })

  if (!slot.booking) {
    assertSlotBookable(slot.date, slot.startTime)
  }

  const paymentMethod = (body.paymentMethod as 'IPG' | 'CASH' | undefined) || 'CASH'
  const paymentStatus = body.paymentStatus === 'PAID' ? 'PAID' : 'PAY_AT_CLUB'
  const equipmentIds = [...new Set(body.equipmentIds || [])]
  const equipmentItems = await loadEquipmentForBooking(club.id, equipmentIds)
  const totalAmount = calculateSessionTotal({
    courtPrice: slot.price,
    equipmentPrices: equipmentItems.map((item) => (item.category === 'CLUB' ? 0 : item.price)),
  })
  const displayStatus = (body.displayStatus as 'RESERVED' | 'TEAM' | 'PENDING' | 'PUBLIC' | undefined)
    || slot.displayStatus
    || 'RESERVED'

  if (slot.booking) {
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: slot.booking!.id },
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
      await syncBookingEquipments(tx, slot.booking!.id, equipmentItems)
      await tx.payment.upsert({
        where: { bookingId: slot.booking!.id },
        update: {
          amount: totalAmount,
          method: paymentMethod,
          status: paymentStatus,
        },
        create: {
          bookingId: slot.booking!.id,
          amount: totalAmount,
          method: paymentMethod,
          status: paymentStatus,
        },
      })
      await tx.slot.update({
        where: { id: slot.id },
        data: { displayStatus },
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
      await syncBookingEquipments(tx, createdBooking.id, equipmentItems)
      await tx.payment.create({
        data: {
          bookingId: createdBooking.id,
          amount: totalAmount,
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
        data: { displayStatus },
      })
    })
  }
  return { ok: true, amount: totalAmount }
})
