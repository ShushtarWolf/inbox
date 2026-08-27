import { cancelCompetitionEntry, findActiveEntry } from '../../../utils/competitions'
import { assertCompetitionAccessById } from '../../../utils/competitionsGate'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const competitionId = getRouterParam(event, 'id')
  if (!competitionId) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  await assertCompetitionAccessById(event, competitionId)

  const body = await readBody<{ reason?: string }>(event)

  const entry = await findActiveEntry(competitionId, user.id)
  if (!entry) {
    throw createError({ statusCode: 404, statusMessage: 'Entry not found' })
  }

  const result = await cancelCompetitionEntry({
    entryId: entry.id,
    athleteId: user.id,
    reason: body.reason,
  })

  return {
    entry: {
      id: result.entry.id,
      status: result.entry.status,
      cancelledAt: result.entry.cancelledAt,
      cancelReason: result.entry.cancelReason,
    },
    refund: result.refund
      ? {
          refunded: result.refund.refunded,
          walletCredited: result.refund.walletCredited,
          gatewayRefunded: result.refund.gatewayRefunded,
          amount: result.refund.amount,
        }
      : null,
    refundPending: result.refundPending,
  }
})
