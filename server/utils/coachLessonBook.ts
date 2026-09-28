import { initialStaffPaymentFields } from '#shared/bookingPayment.ts'
import { computeCoachCourtCharge } from '#shared/coachCourt.ts'
import { phoneToSyntheticEmail } from '#shared/phone.ts'
import { prisma } from './prisma'
import { debitWallet } from './wallet'
import { isUniqueConstraintError } from './prismaErrors'
import { addOneHour } from './reservations'

export type CoachLessonBookSlot = {
  id: string
  date: string
  startTime: string
  endTime: string
  courtPrice: number
  pricingJson: string | null
  staleCancelledBookingId: string | null
}

export async function ensureCoachStudent(opts: {
  coachUserId: string
  studentPhone: string
  studentName?: string
}) {
  let student = await prisma.user.findUnique({ where: { phone: opts.studentPhone } })
  if (student && student.id === opts.coachUserId) {
    throw createError({ statusCode: 400, statusMessage: 'Coach cannot be their own student' })
  }
  if (!student) {
    const name = opts.studentName?.trim() || opts.studentPhone
    student = await prisma.user.create({
      data: {
        name,
        nameEn: name,
        email: phoneToSyntheticEmail(opts.studentPhone),
        phone: opts.studentPhone,
        role: 'ATHLETE',
        locale: 'fa',
      },
    })
  }
  return student
}

/**
 * Claim every slot, debit the coach wallet, and create the lesson rows in one transaction.
 * A failure on any slot rolls the whole series back.
 */
export async function bookCoachLessonsAtomic(input: {
  actorUserId: string
  coachId: string
  sessionPrice: number
  studentId: string
  guestName: string
  studentPhone: string
  slots: CoachLessonBookSlot[]
}) {
  const lessonPayment = initialStaffPaymentFields(input.sessionPrice)
  try {
    return await prisma.$transaction(async (tx) => {
      const created: Array<{
        sessionId: string
        bookingId: string
        courtPaymentId: string
        charge: number
        date: string
        startTime: string
        endTime: string
      }> = []

      for (const slot of input.slots) {
        const price = computeCoachCourtCharge({
          courtPrice: slot.courtPrice,
          startTime: slot.startTime,
          pricingJson: slot.pricingJson,
        })
        const claimed = await tx.slot.updateMany({
          where: { id: slot.id, displayStatus: 'FREE' },
          data: { displayStatus: 'RESERVED' },
        })
        if (claimed.count !== 1) {
          throw createError({ statusCode: 409, statusMessage: 'Slot not available' })
        }
        if (slot.staleCancelledBookingId) {
          await tx.booking.delete({ where: { id: slot.staleCancelledBookingId } })
        }

        const booking = await tx.booking.create({
          data: {
            slotId: slot.id,
            userId: input.actorUserId,
            coachId: input.coachId,
            guestName: input.guestName,
            guestMobile: input.studentPhone,
            paymentStatus: 'PAID',
            paymentMethod: 'PAID',
            source: 'PLATFORM',
            status: 'CONFIRMED',
          },
        })

        if (price.charge > 0) {
          await debitWallet(input.actorUserId, price.charge, {
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
              coachId: input.coachId,
              listedPrice: price.listed,
            }),
          },
        })

        const endTime = slot.endTime || addOneHour(slot.startTime)
        const session = await tx.coachSession.create({
          data: {
            coachId: input.coachId,
            athleteId: input.studentId,
            date: slot.date,
            startTime: slot.startTime,
            endTime,
            price: input.sessionPrice,
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
            actorUserId: input.actorUserId,
            type: 'CREATED',
            metadataJson: JSON.stringify({ source: 'coach-lesson-court', coachSessionId: session.id }),
          },
        })
        await tx.reservationEvent.create({
          data: {
            coachSessionId: session.id,
            actorUserId: input.actorUserId,
            type: 'CREATED',
            metadataJson: JSON.stringify({ source: 'coach-lesson', bookingId: booking.id }),
          },
        })

        created.push({
          sessionId: session.id,
          bookingId: booking.id,
          courtPaymentId: courtPayment.id,
          charge: price.charge,
          date: slot.date,
          startTime: slot.startTime,
          endTime,
        })
      }

      return created
    })
  }
  catch (err) {
    if (isUniqueConstraintError(err)) {
      throw createError({ statusCode: 409, statusMessage: 'Slot not available' })
    }
    throw err
  }
}
