import { serializeShebaRequest, submitUserShebaChange } from '../../utils/shebaChange'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{ sheba?: string | null }>(event)

  if (body.sheba === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'sheba is required' })
  }

  const result = await submitUserShebaChange(user.id, body.sheba)
  return {
    id: user.id,
    sheba: result.sheba,
    pendingShebaRequest: result.pendingRequest ? serializeShebaRequest(result.pendingRequest) : null,
  }
})
