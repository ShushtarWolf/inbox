import { initialPlatformPaymentFields } from '#shared/bookingPayment.ts'
import { computeBookingPrice } from '#shared/courtPricing.ts'
import { notifyBookingConfirmed } from '../../utils/bookingNotify'
import { rethrowSlotConflict, SlotNotAvailableError } from '../../utils/prismaErrors'
import { assertSlotBookable } from '../../utils/reservations'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{ slotId?: string }>(event)
  if (!body.slotId) throw createError({ statusCode: 400, statusMessage: 'slotId required' })

  const slot = await prisma.slot.findUnique({
    where: { id: body.slotId },
    include: { court: { include: { club: true } }, booking: true },
  })
  if (!slot || slot.court.club.status !== 'ACTIVE') {
    throw createError({ statusCode: 404, statusMessage: 'Club not found' })
  }
  const staleCancelledBooking = slot.displayStatus === 'FREE' && slot.booking?.status === 'CANCELLED' ? slot.booking : null
  if (slot.displayStatus !== 'FREE' || (slot.booking && !staleCancelledBooking)) {
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

  let booking
  try {
    booking = await prisma.$transaction(async (tx) => {
      // Optimistic claim — concurrent books lose here instead of overwriting.
      const claimed = await tx.slot.updateMany({
        where: { id: slot.id, displayStatus: 'FREE' },
        data: { displayStatus: 'RESERVED' },
      })
      if (claimed.count !== 1) {
        throw new SlotNotAvailableError()
      }
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
      return b
    })
  } catch (error: unknown) {
    rethrowSlotConflict(error)
  }

  await notifyBookingConfirmed({
    userId: user.id,
    email: dbUser.email,
    phone: dbUser.phone,
    kind: 'court',
    clubName: slot.court.club.nameEn || slot.court.club.nameFa,
    clubId: slot.court.clubId,
    bookingId: booking.id,
    date: slot.date,
    startTime: slot.startTime,
  })

  return { id: booking.id, paymentStatus: paymentFields.paymentStatus }
})
