import { localTimeString, todayDateString } from '#shared/localDate.ts'
import { notifySmsSoft, clubNotifyName, courtNotifyName } from './bookingNotify'
import { prisma } from './prisma'

/**
 * Soft-fail SMS to guests with future (non-cancelled) bookings on this court.
 * Dedupes by phone. Used when owner opts in on court save.
 */
export async function notifyFutureCourtBookers(opts: {
  clubId: string
  clubNameFa?: string | null
  clubNameEn?: string | null
  courtId: string
  courtNameFa?: string | null
  courtNameEn?: string | null
}) {
  const today = todayDateString()
  const nowHm = localTimeString()

  const bookings = await prisma.booking.findMany({
    where: {
      status: { not: 'CANCELLED' },
      slot: {
        courtId: opts.courtId,
        OR: [
          { date: { gt: today } },
          { date: today, startTime: { gt: nowHm } },
        ],
      },
    },
    select: {
      guestMobile: true,
      user: { select: { phone: true } },
      slot: { select: { date: true, startTime: true } },
    },
    take: 200,
  })

  const clubName = clubNotifyName({ nameFa: opts.clubNameFa, nameEn: opts.clubNameEn })
  const courtName = courtNotifyName({ nameFa: opts.courtNameFa, nameEn: opts.courtNameEn })
  const seen = new Set<string>()

  for (const booking of bookings) {
    const phone = (booking.guestMobile || booking.user?.phone || '').trim()
    if (!phone || seen.has(phone)) continue
    seen.add(phone)
    await notifySmsSoft(
      phone,
      'COURT_DETAILS_CHANGED',
      {
        clubName,
        courtName,
        date: booking.slot.date,
        startTime: booking.slot.startTime,
      },
      opts.clubId,
    )
  }

  return { notified: seen.size }
}
