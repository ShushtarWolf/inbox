import { serializeShebaRequest, submitClubShebaChange } from '../../utils/shebaChange'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'finance:payouts')
  const body = await readBody<{ sheba?: string | null }>(event)

  if (body.sheba === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'sheba is required' })
  }

  const result = await submitClubShebaChange(club.id, body.sheba)
  return {
    id: club.id,
    sheba: result.sheba,
    pendingShebaRequest: result.pendingRequest ? serializeShebaRequest(result.pendingRequest) : null,
  }
})
