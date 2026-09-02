import { computeCoachCourtCharge } from '#shared/coachCourt.ts'
import { requireActiveClub, requireApprovedCoach } from '../../utils/coachClubLinks'
import { releaseExpiredOnlinePaymentHolds } from '../../utils/onlinePaymentHold'

/** Free courts at any active club, priced at the full listed rate for the coach wallet. */
export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  const user = await requireRole(event, 'COACH')
  const query = getQuery(event)
  const clubId = String(query.clubId || '')
  const date = (query.date as string) || todayDateStr()
  if (!clubId) throw createError({ statusCode: 400, statusMessage: 'clubId required' })

  const coach = await requireApprovedCoach(user.id)
  await requireActiveClub(clubId)

  await ensureSlotsForDate(clubId, date)
  await releaseExpiredOnlinePaymentHolds({ clubId })

  const slots = await prisma.slot.findMany({
    where: { court: { clubId }, date, displayStatus: 'FREE' },
    include: { court: true },
    orderBy: [{ courtId: 'asc' }, { startTime: 'asc' }],
  })

  // Past FREE hours stay selectable for coach backfill (mirrors owner desk reserve).
  return {
    date,
    sessionPrice: coach.sessionPrice,
    slots: slots.map((slot) => {
      const price = computeCoachCourtCharge({
        courtPrice: slot.court.price,
        startTime: slot.startTime,
        pricingJson: slot.court.pricingJson,
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
