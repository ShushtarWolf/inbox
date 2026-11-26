import type { Prisma } from '@prisma/client'

type Db = Pick<Prisma.TransactionClient, 'coachSession' | 'booking'>

export type CoachTimeConflict =
  | { kind: 'coach_session'; sessionId: string }
  | { kind: 'court_booking'; bookingId: string }

/** Active coach commitment at an exact slot start (marketplace session or court-tagged booking). */
export async function findCoachTimeConflict(
  coachId: string,
  date: string,
  startTime: string,
  db: Db = prisma,
): Promise<CoachTimeConflict | null> {
  const session = await db.coachSession.findFirst({
    where: { coachId, date, startTime, status: { not: 'CANCELLED' } },
    select: { id: true },
  })
  if (session) return { kind: 'coach_session', sessionId: session.id }

  const courtTagged = await db.booking.findFirst({
    where: {
      coachId,
      status: { not: 'CANCELLED' },
      slot: { date, startTime },
    },
    select: { id: true },
  })
  if (courtTagged) return { kind: 'court_booking', bookingId: courtTagged.id }

  return null
}

export async function assertCoachTimeAvailable(
  coachId: string,
  date: string,
  startTime: string,
  db: Db = prisma,
) {
  const conflict = await findCoachTimeConflict(coachId, date, startTime, db)
  if (conflict) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Coach is already committed at this time',
    })
  }
}