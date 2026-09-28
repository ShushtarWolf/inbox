import { initialStaffPaymentFields } from '#shared/bookingPayment.ts'
import { normalizeIranPhone, phoneToSyntheticEmail } from '#shared/phone.ts'
import { notifyBookingConfirmed, clubNotifyLocation, clubNotifyName, personNotifyName } from '../../utils/bookingNotify'
import { coachHourIsOpen, padCoachTime } from '../../utils/coachCalendarLesson'
import { requireApprovedCoach } from '../../utils/coachClubLinks'
import { isUniqueConstraintError } from '../../utils/prismaErrors'
import { addOneHour } from '../../utils/reservations'

/**
 * Put a student on the coach calendar for an hour they already picked.
 * No court is taken and the coach wallet is not charged.
 */
export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  const user = await requireRole(event, 'COACH')
  const body = await readBody<{ date?: string; startTime?: string; studentPhone?: string; studentName?: string }>(event)

  const date = body.date?.trim() || ''
  const startTime = padCoachTime(body.startTime || '')
  const studentPhone = normalizeIranPhone(body.studentPhone || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !startTime || !startTime.endsWith(':00') || !studentPhone) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const coach = await requireApprovedCoach(user.id)
  const profile = await prisma.coach.findUnique({
    where: { id: coach.id },
    include: { availability: true, club: true },
  })
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Coach profile not found' })

  const dayOfWeek = new Date(`${date}T00:00:00`).getDay()
  if (!coachHourIsOpen(profile.availability, dayOfWeek, startTime)) {
    throw createError({ statusCode: 409, statusMessage: 'Coach is not available at this time' })
  }

  let student = await prisma.user.findUnique({ where: { phone: studentPhone } })
  if (student && student.id === user.id) {
    throw createError({ statusCode: 400, statusMessage: 'Coach cannot be their own student' })
  }
  if (!student) {
    student = await prisma.user.create({
      data: {
        name: body.studentName?.trim() || studentPhone,
        nameEn: body.studentName?.trim() || studentPhone,
        email: phoneToSyntheticEmail(studentPhone),
        phone: studentPhone,
        role: 'ATHLETE',
        locale: 'fa',
      },
    })
  }

  const athlete = student
  const lessonPayment = initialStaffPaymentFields(profile.sessionPrice)
  const endTime = addOneHour(startTime)

  let sessionId: string
  try {
    sessionId = await prisma.$transaction(async (tx) => {
      const conflicting = await tx.coachSession.findFirst({
        where: {
          coachId: profile.id,
          date,
          status: { not: 'CANCELLED' },
          OR: [{ startTime }, { startTime: `${startTime}:00` }],
        },
      })
      if (conflicting) {
        throw createError({ statusCode: 409, statusMessage: 'This session time is already booked' })
      }

      const session = await tx.coachSession.create({
        data: {
          coachId: profile.id,
          athleteId: athlete.id,
          date,
          startTime,
          endTime,
          price: profile.sessionPrice,
          paymentStatus: lessonPayment.paymentStatus,
        },
      })
      await tx.payment.create({
        data: { coachSessionId: session.id, ...lessonPayment.payment },
      })
      await tx.reservationEvent.create({
        data: {
          coachSessionId: session.id,
          actorUserId: user.id,
          type: 'CREATED',
          metadataJson: JSON.stringify({ source: 'coach-calendar' }),
        },
      })
      return session.id
    })
  }
  catch (err) {
    if (isUniqueConstraintError(err)) {
      throw createError({ statusCode: 409, statusMessage: 'This session time is already booked' })
    }
    throw err
  }

  const clubName = profile.club
    ? clubNotifyName(profile.club)
    : (profile.nameFa || profile.nameEn)

  await notifyBookingConfirmed({
    userId: athlete.id,
    email: athlete.email,
    phone: athlete.phone,
    kind: 'coach',
    clubName,
    clubId: profile.clubId || undefined,
    bookingId: sessionId,
    date,
    startTime,
    endTime,
    paymentPaid: false,
    guestName: personNotifyName(athlete.name),
    ...(profile.club ? clubNotifyLocation(profile.club) : {}),
  })

  return {
    coachSessionId: sessionId,
    sessionPrice: profile.sessionPrice,
    date,
    startTime,
    endTime,
  }
})
