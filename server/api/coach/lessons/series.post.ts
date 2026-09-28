import { normalizeIranPhone } from '#shared/phone.ts'
import { notifyBookingConfirmed, clubNotifyLocation, clubNotifyName, personNotifyName } from '../../../utils/bookingNotify'
import { requireApprovedCoach } from '../../../utils/coachClubLinks'
import { bookCoachLessonsAtomic, ensureCoachStudent } from '../../../utils/coachLessonBook'
import { resolveCoachSeries } from '../../../utils/coachSeriesResolve'
import { syncClubContactForBooking } from '../../../utils/contactSync'
import { creditOwnerForPaidPayment } from '../../../utils/settlement'
import { getWalletBalance } from '../../../utils/wallet'

/**
 * Book every session in a coach's weekly rules, or none of them.
 * Court fees are debited from the coach wallet in the same transaction.
 */
export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  const user = await requireRole(event, 'COACH')
  const coach = await requireApprovedCoach(user.id)
  const body = await readBody<{
    clubId?: string
    startDate?: string
    finishDate?: string
    rules?: unknown
    studentPhone?: string
    studentName?: string
  }>(event)

  const studentPhone = normalizeIranPhone(body.studentPhone || '')
  if (!studentPhone) throw createError({ statusCode: 400, statusMessage: 'Invalid input' })

  const resolved = await resolveCoachSeries({
    coachId: coach.id,
    sessionPrice: coach.sessionPrice,
    clubId: String(body.clubId || ''),
    startDate: String(body.startDate || ''),
    finishDate: String(body.finishDate || ''),
    rules: body.rules,
  })
  if (resolved.conflicts.length || !resolved.bookable.length) {
    throw createError({ statusCode: 409, statusMessage: 'Slot not available' })
  }
  if (resolved.totalCourtCharge > 0) {
    const balance = await getWalletBalance(user.id)
    if (balance < resolved.totalCourtCharge) {
      throw createError({ statusCode: 409, statusMessage: 'Insufficient wallet balance' })
    }
  }

  const student = await ensureCoachStudent({
    coachUserId: user.id,
    studentPhone,
    studentName: body.studentName,
  })
  const guestName = body.studentName?.trim() || student.name
  const created = await bookCoachLessonsAtomic({
    actorUserId: user.id,
    coachId: coach.id,
    sessionPrice: coach.sessionPrice,
    studentId: student.id,
    guestName,
    studentPhone,
    slots: resolved.bookable.map((slot) => ({
      id: slot.id,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      courtPrice: slot.courtPrice,
      pricingJson: slot.pricingJson,
      staleCancelledBookingId: slot.staleCancelledBookingId,
    })),
  })

  for (const row of created) {
    await syncClubContactForBooking(row.bookingId)
    if (row.charge > 0) await creditOwnerForPaidPayment(row.courtPaymentId)
  }

  const first = created[0]!
  const last = created[created.length - 1]!
  await notifyBookingConfirmed({
    userId: student.id,
    email: student.email,
    phone: student.phone,
    kind: 'coach',
    clubName: clubNotifyName(resolved.club),
    clubId: resolved.club.id,
    bookingId: first.sessionId,
    date: first.date,
    finishDate: last.date,
    startTime: first.startTime,
    endTime: first.endTime,
    sessionCount: created.length,
    paymentPaid: false,
    guestName: personNotifyName(student.name),
    ...clubNotifyLocation(resolved.club),
  })

  return {
    sessionCount: created.length,
    totalCourtCharge: created.reduce((sum, row) => sum + row.charge, 0),
    sessionPrice: coach.sessionPrice,
  }
})
