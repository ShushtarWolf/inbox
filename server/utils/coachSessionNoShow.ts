import type { Prisma } from '@prisma/client'

/**
 * Mark a coach session as no-show — CRM / stats only (see docs/PAYMENT_SCENARIOS.md).
 * Does not move money or change payment status.
 */
export async function markCoachSessionNoShow(opts: {
  sessionId: string
  actorUserId: string
  db?: Prisma.TransactionClient
}) {
  const run = async (tx: Prisma.TransactionClient) => {
    const session = await tx.coachSession.findUnique({
      where: { id: opts.sessionId },
      select: { id: true, status: true, noShowAt: true },
    })
    if (!session) {
      throw createError({ statusCode: 404, statusMessage: 'Session not found' })
    }
    if (session.status === 'CANCELLED') {
      throw createError({ statusCode: 409, statusMessage: 'Session is cancelled' })
    }
    if (session.noShowAt) {
      return session
    }
    const updated = await tx.coachSession.update({
      where: { id: opts.sessionId },
      data: { noShowAt: new Date() },
    })
    await tx.reservationEvent.create({
      data: {
        coachSessionId: opts.sessionId,
        actorUserId: opts.actorUserId,
        type: 'NO_SHOW',
        metadataJson: JSON.stringify({ source: 'coach-session-no-show' }),
      },
    })
    return updated
  }

  if (opts.db) return run(opts.db)
  return prisma.$transaction(run)
}