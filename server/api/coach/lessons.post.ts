import { computeCoachCourtCharge } from '#shared/coachCourt.ts'
import { normalizeIranPhone } from '#shared/phone.ts'
import { notifyBookingConfirmed, clubNotifyLocation, clubNotifyName, personNotifyName } from '../../utils/bookingNotify'
import { requireActiveClub, requireApprovedCoach } from '../../utils/coachClubLinks'
import { bookCoachLessonsAtomic, ensureCoachStudent } from '../../utils/coachLessonBook'
import { syncClubContactForBooking } from '../../utils/contactSync'
import { addOneHour } from '../../utils/reservations'
import { creditOwnerForPaidPayment } from '../../utils/settlement'
import { getWalletBalance } from '../../utils/wallet'
import { assertExternalBookingAllowedIfEnabled } from '../../utils/externalBookingGuard'

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

  await assertExternalBookingAllowedIfEnabled({
    club: {
      id: slot.court.club.id,
      slug: slot.court.club.slug,
      defaultSessionDurationMinutes: slot.court.club.defaultSessionDurationMinutes,
      openHour: slot.court.club.openHour,
      closeHour: slot.court.club.closeHour,
    },
    slots: [{
      courtId: slot.courtId,
      date: slot.date,
      startTime: slot.startTime,
    }],
  })

  const conflicting = await prisma.coachSession.findFirst({
    where: { coachId: coach.id, date: slot.date, startTime: slot.startTime, status: { not: 'CANCELLED' } },
  })
  if (conflicting) {
    throw createError({ statusCode: 409, statusMessage: 'This session time is already booked' })
  }

  const student = await ensureCoachStudent({
    coachUserId: user.id,
    studentPhone,
    studentName: body.studentName,
  })

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
  const endTime = slot.endTime || addOneHour(slot.startTime)

  const [created] = await bookCoachLessonsAtomic({
    actorUserId: user.id,
    coachId: coach.id,
    sessionPrice: coach.sessionPrice,
    studentId: student.id,
    guestName: body.studentName?.trim() || student.name,
    studentPhone,
    slots: [{
      id: slot.id,
      date: slot.date,
      startTime: slot.startTime.slice(0, 5),
      endTime: endTime.slice(0, 5),
      courtPrice: slot.court.price,
      pricingJson: slot.court.pricingJson,
      staleCancelledBookingId: staleCancelledBooking?.id || null,
    }],
  })
  if (!created) throw createError({ statusCode: 409, statusMessage: 'Slot not available' })

  await syncClubContactForBooking(created.bookingId)
  if (created.charge > 0) {
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
