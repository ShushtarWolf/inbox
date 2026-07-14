import { initialPlatformPaymentFields } from '#shared/bookingPayment.ts'
import { computeBookingPrice } from '#shared/courtPricing.ts'
import { assertSlotBookable } from '../../utils/reservations'

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
    throw createError({ statusCode: 409, statusMessage: 'Slot not available' })
  }

  assertSlotBookable(slot.date, slot.startTime)

  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
  const bookingAmount = computeBookingPrice(
    slot.price,
    slot.court.pricingJson,
    slot.date,
    slot.startTime,
  )
  const paymentFields = initialPlatformPaymentFields(bookingAmount)
  const booking = await prisma.$transaction(async (tx) => {
    if (staleCancelledBooking) {
      await tx.booking.delete({ where: { id: staleCancelledBooking.id } })
    }
    const b = await tx.booking.create({
      data: {
        slotId: slot.id,
        userId: user.id,
        guestName: dbUser.name,
        guestMobile: dbUser.phone,
        paymentStatus: paymentFields.paymentStatus,
        source: 'PLATFORM',
        status: 'CONFIRMED',
      },
    })
    await tx.payment.create({
      data: {
        bookingId: b.id,
        ...paymentFields.payment,
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

  if (dbUser.email) {
    await sendNotification({
      channel: 'email',
      to: dbUser.email,
      template: 'BOOKING_CONFIRMED',
      data: {
        kind: 'court',
        clubName: slot.court.club.nameEn || slot.court.club.nameFa,
        date: slot.date,
        startTime: slot.startTime,
      },
    })
  }

  return { id: booking.id, paymentStatus: paymentFields.paymentStatus }
})
