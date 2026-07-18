import { initialPlatformPaymentFields } from '#shared/bookingPayment.ts'
import { notifyBookingConfirmed } from '../../utils/bookingNotify'
import { findCoachByIdOrSlug } from '../../utils/coaches'
import { addOneHour, canManageReservation, assertSlotBookable } from '../../utils/reservations'

export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  const user = await requireUser(event)
  const body = await readBody<{ coachId?: string; date?: string; startTime?: string }>(event)
  if (!body.coachId || !body.date || !body.startTime) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const coachRecord = await findCoachByIdOrSlug(body.coachId)
  if (!coachRecord) throw createError({ statusCode: 404, statusMessage: 'Coach not found' })

  const coach = await prisma.coach.findUnique({
    where: { id: coachRecord.id },
    include: { availability: true, club: true },
  })
  if (!coach) throw createError({ statusCode: 404, statusMessage: 'Coach not found' })
  if (!coach.isBookable) throw createError({ statusCode: 409, statusMessage: 'Coach is not bookable' })

  const dayOfWeek = new Date(`${body.date}T00:00:00`).getDay()
  const availability = coach.availability.find((item) =>
    item.dayOfWeek === dayOfWeek && item.startTime <= body.startTime! && item.endTime > body.startTime!,
  )
  if (!availability) {
    throw createError({ statusCode: 409, statusMessage: 'Coach is not available at this time' })
  }
  assertSlotBookable(body.date, body.startTime)
  if (!canManageReservation(body.date, body.startTime, coach.club?.rescheduleWindowHours ?? 24)) {
    throw createError({ statusCode: 409, statusMessage: 'BOOKING_TOO_SOON' })
  }
  const existing = await prisma.coachSession.findFirst({
    where: { coachId: coach.id, date: body.date, startTime: body.startTime, status: { not: 'CANCELLED' } },
  })
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'This session time is already booked' })
  }

  const paymentFields = initialPlatformPaymentFields(coach.sessionPrice)
  const session = await prisma.coachSession.create({
    data: {
      coachId: coach.id,
      athleteId: user.id,
      date: body.date,
      startTime: body.startTime,
      endTime: addOneHour(body.startTime),
      price: coach.sessionPrice,
      paymentStatus: paymentFields.paymentStatus,
    },
  })
  await prisma.payment.create({
    data: {
      coachSessionId: session.id,
      ...paymentFields.payment,
    },
  })
  await prisma.reservationEvent.create({
    data: {
      coachSessionId: session.id,
      actorUserId: user.id,
      type: 'CREATED',
      metadataJson: JSON.stringify({ source: 'coach-booking' }),
    },
  })

  const athlete = await prisma.user.findUnique({ where: { id: user.id } })
  await notifyBookingConfirmed({
    userId: user.id,
    email: athlete?.email,
    phone: athlete?.phone,
    kind: 'coach',
    clubName: coach.club?.nameEn || coach.club?.nameFa || coach.nameEn || coach.nameFa,
    clubId: coach.clubId || undefined,
    bookingId: session.id,
    date: body.date,
    startTime: body.startTime,
  })

  return session
})
