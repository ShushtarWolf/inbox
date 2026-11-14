import {
  ATHLETE_OPEN_PAY_AT_CLUB_LIMIT,
  ATHLETE_PAY_AT_CLUB_LIMIT,
} from '#shared/athletePayAtClub.ts'

const OPEN_PAY_AT_CLUB_STATUSES = ['PAY_AT_CLUB', 'PENDING_AT_CLUB'] as const

/** Count active platform unpaid pay-at-club court bookings for one athlete at one club. */
export async function countAthleteOpenPayAtClubBookings(userId: string, clubId: string): Promise<number> {
  return prisma.booking.count({
    where: {
      userId,
      status: { in: ['PENDING', 'CONFIRMED'] },
      source: 'PLATFORM',
      paymentStatus: { in: [...OPEN_PAY_AT_CLUB_STATUSES] },
      payment: { is: { amount: { gt: 0 }, status: { in: [...OPEN_PAY_AT_CLUB_STATUSES] } } },
      slot: { is: { court: { is: { clubId } } } },
    },
  })
}

export async function assertAthletePayAtClubUnderLimit(userId: string, clubId: string) {
  const open = await countAthleteOpenPayAtClubBookings(userId, clubId)
  if (open >= ATHLETE_OPEN_PAY_AT_CLUB_LIMIT) {
    throw createError({
      statusCode: 429,
      statusMessage: ATHLETE_PAY_AT_CLUB_LIMIT,
    })
  }
}