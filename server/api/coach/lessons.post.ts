import { initialStaffPaymentFields } from '#shared/bookingPayment.ts'
import { computeCoachCourtCharge } from '#shared/coachCourt.ts'
import { normalizeIranPhone, phoneToSyntheticEmail } from '#shared/phone.ts'
import { notifyBookingConfirmed, clubNotifyLocation, clubNotifyName, personNotifyName } from '../../utils/bookingNotify'
import { requireActiveClub, requireApprovedCoach } from '../../utils/coachClubLinks'
import { syncClubContactForBooking } from '../../utils/contactSync'
import { isUniqueConstraintError } from '../../utils/prismaErrors'
import { addOneHour } from '../../utils/reservations'
import { creditOwnerForPaidPayment } from '../../utils/settlement'
import { debitWallet, getWalletBalance } from '../../utils/wallet'

/**
 * A coach reserves a club court for a private lesson: the student is billed the coach's
 * session fee as usual, while the court itself is charged straight to the coach's wallet
 * at the full listed price (no club–coach discount relationship).
 */
export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  const user = await requireRole(event, 'COACH')
  const body = await readBody<{ slotId?: string; studentPhone?: string; studentName?: string }>(event)

  const slotId = body.slotId?.trim()
  const studentPhone = normalizeIranPhone(body.studentPhone || '')
  if (!slotId || !studentPhone) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const coach = await requireApprovedCoach(user.id)

  const slot = await prisma.slot.findUnique({
    where: { id: slotId },
    include: { court: { include: { club: true } }, booking: true },
  })
  if (!slot) throw createError({ statusCode: 404, statusMessage: 'Slot not found' })

  await requireActiveClub(slot.court.clubId)
  // Coaches may book elapsed hours for backfill / finance; athletes still hit assertSlotBookable.

  const staleCancelledBooking = slot.displayStatus === 'FREE' && slot.booking?.status === 'CANCELLED'
    ? slot.booking
    : null
  if (slot.displayStatus !== 'FREE' || (slot.booking && !staleCancelledBooking)) {
    throw createError({ statusCode: 409, statusMessage: 'Slot not available' })
  }

  const conflicting = await prisma.coachSession.findFirst({
    where: { coachId: coach.id, date: slot.date, startTime: slot.startTime, status: { not: 'CANCELLED' } },
  })
  if (conflicting) {
    throw createError({ statusCode: 409, statusMessage: 'This session time is already booked' })
  }

  // The student books with a phone and can claim the account later, same as desk reservations.
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

  const price = computeCoachCourtCharge({
    courtPrice: slot.court.price,
    startTime: slot.startTime,
    pricingJson: slot.court.pricingJson,
  })
  // Fail-fast before claiming the slot; debitWallet still re-checks atomically in the txn.
  if (price.charge > 0) {
    const balance = await getWalletBalance(user.id)
    if (balance < price.charge) {
      throw createError({ statusCode: 409, statusMessage: 'Insufficient wallet balance' })
    }
  }
  const lessonPayment = initialStaffPaymentFields(coach.sessionPrice)
  const endTime = slot.endTime || addOneHour(slot.startTime)

  let created: { sessionId: string; bookingId: string; courtPaymentId: string }
  try {
    created = await prisma.$transaction(async (tx) => {
      const claimed = await tx.slot.updateMany({
        where: { id: slot.id, displayStatus: 'FREE' },
        data: { displayStatus: 'RESERVED' },
      })
      if (claimed.count !== 1) {
        throw createError({ statusCode: 409, statusMessage: 'Slot not available' })
      }
      if (staleCancelledBooking) {
        await tx.booking.delete({ where: { id: staleCancelledBooking.id } })
      }

      // The coach is the payer of record for the court; the student shows as the player.
      const booking = await tx.booking.create({
        data: {
          slotId: slot.id,
          userId: user.id,
          coachId: coach.id,
          guestName: body.studentName?.trim() || student!.name,
          guestMobile: studentPhone,
          paymentStatus: 'PAID',
          paymentMethod: 'PAID',
          source: 'PLATFORM',
          status: 'CONFIRMED',
        },
      })

      if (price.charge > 0) {
        await debitWallet(user.id, price.charge, {
          bookingId: booking.id,
          note: 'Coach lesson court charge',
        }, tx)
      }

      const courtPayment = await tx.payment.create({
        data: {
          bookingId: booking.id,
          amount: price.charge,
          method: 'PAID',
          status: 'PAID',
          provider: 'pay_at_club',
          metadataJson: JSON.stringify({
            source: 'coach-lesson-court',
            coachId: coach.id,
            listedPrice: price.listed,
          }),
        },
      })

      const session = await tx.coachSession.create({
        data: {
          coachId: coach.id,
          athleteId: student!.id,
          date: slot.date,
          startTime: slot.startTime,
          endTime,
          price: coach.sessionPrice,
          paymentStatus: lessonPayment.paymentStatus,
          courtBookingId: booking.id,
        },
      })
      await tx.payment.create({
        data: { coachSessionId: session.id, ...lessonPayment.payment },
      })

      await tx.reservationEvent.create({
        data: {
          bookingId: booking.id,
          actorUserId: user.id,
          type: 'CREATED',
          metadataJson: JSON.stringify({ source: 'coach-lesson-court', coachSessionId: session.id }),
        },
      })
      await tx.reservationEvent.create({
        data: {
          coachSessionId: session.id,
          actorUserId: user.id,
          type: 'CREATED',
          metadataJson: JSON.stringify({ source: 'coach-lesson', bookingId: booking.id }),
        },
      })

      return { sessionId: session.id, bookingId: booking.id, courtPaymentId: courtPayment.id }
    })
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw createError({ statusCode: 409, statusMessage: 'Slot not available' })
    }
    throw err
  }

  await syncClubContactForBooking(created.bookingId)
  if (price.charge > 0) {
    await creditOwnerForPaidPayment(created.courtPaymentId)
  }

  await notifyBookingConfirmed({
    userId: student.id,
    email: student.email,
    phone: student.phone,
    kind: 'coach',
    clubName: clubNotifyName(slot.court.club),
    clubId: slot.court.clubId,
    bookingId: created.sessionId,
    date: slot.date,
    startTime: slot.startTime,
    endTime,
    paymentPaid: false,
    guestName: personNotifyName(student.name),
    ...clubNotifyLocation(slot.court.club),
  })

  return {
    coachSessionId: created.sessionId,
    courtBookingId: created.bookingId,
    listedPrice: price.listed,
    courtCharge: price.charge,
    sessionPrice: coach.sessionPrice,
  }
})
