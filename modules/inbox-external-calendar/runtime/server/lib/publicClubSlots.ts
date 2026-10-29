import { isDateBeyondBookingHorizon } from '#shared/bookingHorizon.ts'
import { isPastDate, isSlotStartInPast } from '#shared/localDate.ts'
import { resolveClubSlugAlias } from '#shared/clubSlugAliases.ts'

export async function loadPublicClubSlots(
  clubId: string,
  date: string,
  opts?: { horizonDays?: number | null },
) {
  if (isPastDate(date)) return []
  if (opts?.horizonDays != null && isDateBeyondBookingHorizon(date, opts.horizonDays)) return []

  await ensureSlotsForDate(clubId, date)
  await releaseExpiredOnlinePaymentHolds({ clubId })

  const slots = await prisma.slot.findMany({
    where: {
      court: { clubId },
      date,
      displayStatus: { not: 'CLOSED' },
    },
    select: {
      id: true,
      courtId: true,
      startTime: true,
      endTime: true,
      displayStatus: true,
      booking: { select: { status: true } },
    },
    orderBy: [{ courtId: 'asc' }, { startTime: 'asc' }],
  })

  return slots
    .map((slot) => ({
      id: slot.id,
      courtId: slot.courtId,
      startTime: slot.startTime,
      endTime: slot.endTime,
      displayStatus: slot.booking?.status === 'CANCELLED' ? 'FREE' : slot.displayStatus,
    }))
    .filter((slot) => !isSlotStartInPast(date, slot.startTime))
}

export async function resolveActiveClubBySlug(slugInput: string) {
  const clubSlug = resolveClubSlugAlias(slugInput)
  if (!clubSlug) return null
  const club = await prisma.club.findUnique({ where: { slug: clubSlug } })
  if (!club || club.status !== 'ACTIVE') return null
  return club
}
