import { computeCoachCourtCharge } from '#shared/coachCourt.ts'
import { isPastDate, isSlotStartInPast } from '#shared/localDate.ts'
import { requireActiveCoachClubLink, requireApprovedCoach } from '../../utils/coachClubLinks'
import { releaseExpiredOnlinePaymentHolds } from '../../utils/onlinePaymentHold'

/** Free courts at a linked club, priced at what this coach's wallet would actually be charged. */
export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  const user = await requireRole(event, 'COACH')
  const query = getQuery(event)
  const clubId = String(query.clubId || '')
  const date = (query.date as string) || todayDateStr()
  if (!clubId) throw createError({ statusCode: 400, statusMessage: 'clubId required' })

  const coach = await requireApprovedCoach(user.id)
  const link = await requireActiveCoachClubLink(coach.id, clubId)

  if (isPastDate(date)) {
    return { date, discountPercent: link.courtDiscountPercent, slots: [] }
  }

  await ensureSlotsForDate(clubId, date)
  await releaseExpiredOnlinePaymentHolds({ clubId })

  const slots = await prisma.slot.findMany({
    where: { court: { clubId }, date, displayStatus: 'FREE' },
    include: { court: true },
    orderBy: [{ courtId: 'asc' }, { startTime: 'asc' }],
  })

  return {
    date,
    discountPercent: link.courtDiscountPercent,
    sessionPrice: coach.sessionPrice,
    slots: slots
      .filter((slot) => !isSlotStartInPast(slot.date, slot.startTime))
      .map((slot) => {
        const price = computeCoachCourtCharge({
          courtPrice: slot.court.price,
          startTime: slot.startTime,
          pricingJson: slot.court.pricingJson,
          discountPercent: link.courtDiscountPercent,
        })
        return {
          id: slot.id,
          courtId: slot.courtId,
          courtNameFa: slot.court.nameFa,
          courtNameEn: slot.court.nameEn,
          startTime: slot.startTime,
          endTime: slot.endTime,
          listedPrice: price.listed,
          courtCharge: price.charge,
        }
      }),
  }
})
